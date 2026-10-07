import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

// Local PostgreSQL contract checks with a minimal Auth stub. This does not
// exercise Supabase Auth/PostgREST or multi-connection locking.
const userA = '00000000-0000-0000-0000-000000000001'
const userB = '00000000-0000-0000-0000-000000000002'

async function database(legacy = false) {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.role() returns text language sql stable as
      $$ select current_setting('request.jwt.claim.role', true) $$;
    grant usage on schema auth to authenticated, service_role;
    grant execute on all functions in schema auth to authenticated, service_role;
  `)
  const sql = await readFile(new URL('../supabase/migrations/202610070001_t05_trip_storage.sql', import.meta.url), 'utf8')
  // PGlite supplies gen_random_uuid in core; it has no pgcrypto extension.
  const initial = sql.replace('create extension if not exists pgcrypto;', '')
  await db.exec(legacy ? initial.replaceAll('is distinct from p_expected_revision', '<> p_expected_revision') : initial)
  await db.query('insert into auth.users(id) values ($1), ($2)', [userA, userB])
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userA])
  await db.query("select set_config('request.jwt.claim.role', 'authenticated', false)")
  await db.exec('set role authenticated')
  return db
}

const rejectsCode = (operation, code) => assert.rejects(operation, error => error.code === code)

test('date/place mutations require a non-null matching revision', async () => {
  const db = await database()
  try {
    const { rows: [{ id }] } = await db.query("select public.create_trip('A') as id")
    await rejectsCode(db.query("select public.add_trip_date($1, '2026-10-07', null)", [id]), '40001')
    await rejectsCode(db.query("select public.add_trip_place($1, 'Cafe', null)", [id]), '40001')
    await db.query("select public.add_trip_date($1, '2026-10-07', 1)", [id])
    await rejectsCode(db.query("select public.add_trip_date($1, '2026-10-08', 1)", [id]), '40001')
    assert.equal((await db.query('select revision from trips where id=$1', [id])).rows[0].revision, 2)
  } finally { await db.close() }
})

test('operator policy updates require a non-null matching policy revision', async () => {
  const db = await database()
  try {
    await db.exec('reset role; set role service_role')
    await db.query("select set_config('request.jwt.claim.role', 'service_role', false)")
    await rejectsCode(db.query("select public.operator_set_tier_limits('free', 4, 60, null)"), '40001')
    await db.query("select public.operator_set_tier_limits('free', 4, 60, 1)")
    await rejectsCode(db.query("select public.operator_set_tier_limits('free', 5, 70, 1)"), '40001')
  } finally { await db.close() }
})

test('owner reads, RPC ownership, direct writes and travel count boundaries', async () => {
  const db = await database()
  try {
    const { rows: [{ id }] } = await db.query("select public.create_trip('A1') as id")
    await db.query("select public.create_trip('A2')")
    await db.query("select public.create_trip('A3')")
    await rejectsCode(db.query("select public.create_trip('A4')"), 'P0001')
    await rejectsCode(db.query("insert into trips(owner_id, name) values ($1, 'bypass')", [userA]), '42501')
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userB])
    assert.equal((await db.query('select * from trips')).rows.length, 0)
    await rejectsCode(db.query("select public.add_trip_date($1, '2026-10-07', 1)", [id]), '42501')
    await rejectsCode(db.query("select public.operator_set_user_access($1, 'paid2', true)", [userB]), '42501')
  } finally { await db.close() }
})


test('forward migration repairs an already-applied schema without losing data or RPC grants', async () => {
  const db = await database(true)
  try {
    const { rows: [{ id }] } = await db.query("select public.create_trip('existing trip') as id")
    await db.exec('reset role')
    await db.exec(await readFile(new URL('../supabase/migrations/202610070002_revision_guards.sql', import.meta.url), 'utf8'))
    await db.exec('set role authenticated')
    assert.equal((await db.query('select name from trips where id=$1', [id])).rows[0].name, 'existing trip')
    await rejectsCode(db.query("select public.add_trip_date($1, '2026-10-07', null)", [id]), '40001')
    await rejectsCode(db.query("select public.add_trip_place($1, 'Cafe', null)", [id]), '40001')
    await db.exec('reset role; set role service_role')
    await db.query("select set_config('request.jwt.claim.role', 'service_role', false)")
    await rejectsCode(db.query("select public.operator_set_tier_limits('free', 4, 60, null)"), '40001')
  } finally { await db.close() }
})
