create extension if not exists pgcrypto;

create table public.app_settings (
  id boolean primary key default true check (id),
  revision bigint not null default 1
);
insert into public.app_settings (id) values (true) on conflict (id) do nothing;

create table public.tier_limits (
  tier text primary key check (tier in ('free', 'paid1', 'paid2')),
  trip_limit integer not null check (trip_limit > 0),
  place_limit integer not null check (place_limit > 0)
);
insert into public.tier_limits (tier, trip_limit, place_limit) values
  ('free', 3, 50), ('paid1', 15, 150), ('paid2', 50, 300)
on conflict (tier) do nothing;

create table public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tier text not null default 'free' references public.tier_limits(tier),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now()
);
create index trips_owner_created_idx on public.trips(owner_id, created_at desc);

create table public.trip_dates (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  travel_date date not null,
  created_at timestamptz not null default now(),
  unique (trip_id, travel_date)
);

create table public.places (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 200),
  category text check (category is null or category in ('restaurant', 'cafe', 'sightseeing', 'lodging', 'transport', 'other')),
  memo text not null default '',
  created_at timestamptz not null default now()
);
create index places_trip_idx on public.places(trip_id);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.user_profiles(user_id, tier, is_admin)
  values (new.id, 'free', false)
  on conflict (user_id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.tier_limits enable row level security;
alter table public.user_profiles enable row level security;
alter table public.app_settings enable row level security;
alter table public.trips enable row level security;
alter table public.trip_dates enable row level security;
alter table public.places enable row level security;

create policy "signed in users read tier limits" on public.tier_limits
  for select to authenticated using (true);
create policy "users read own profile" on public.user_profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy "owners read trips" on public.trips
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "owners read trip dates" on public.trip_dates
  for select to authenticated using (
    exists (select 1 from public.trips t where t.id = trip_id and t.owner_id = (select auth.uid()))
  );
create policy "owners read trip places" on public.places
  for select to authenticated using (
    exists (select 1 from public.trips t where t.id = trip_id and t.owner_id = (select auth.uid()))
  );

revoke all on public.app_settings, public.tier_limits, public.user_profiles,
  public.trips, public.trip_dates, public.places from anon, authenticated;
grant select on public.tier_limits, public.user_profiles, public.trips,
  public.trip_dates, public.places to authenticated;
grant usage on schema public to authenticated;

create function public.create_trip(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_tier text;
  v_limit integer;
  v_count bigint;
  v_trip uuid;
begin
  if v_user is null then raise exception '로그인이 필요합니다.' using errcode = '42501'; end if;
  if length(trim(coalesce(p_name, ''))) not between 1 and 120 then
    raise exception '여행 이름은 1자 이상 120자 이하여야 합니다.' using errcode = '22023';
  end if;
  perform 1 from public.app_settings where id = true for share;
  select tier into v_tier from public.user_profiles where user_id = v_user for update;
  if v_tier is null then raise exception '계정 등급을 확인할 수 없습니다.' using errcode = '42501'; end if;
  select trip_limit into v_limit from public.tier_limits where tier = v_tier;
  select count(*) into v_count from public.trips where owner_id = v_user;
  if v_count >= v_limit then raise exception '여행 저장 한도에 도달했습니다.' using errcode = 'P0001'; end if;
  insert into public.trips(owner_id, name) values (v_user, trim(p_name)) returning id into v_trip;
  return v_trip;
end;
$$;

create function public.add_trip_date(p_trip_id uuid, p_date date, p_expected_revision bigint)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_tier text;
  v_trip public.trips%rowtype;
begin
  if v_user is null then raise exception '로그인이 필요합니다.' using errcode = '42501'; end if;
  perform 1 from public.app_settings where id = true for share;
  select tier into v_tier from public.user_profiles where user_id = v_user for update;
  if v_tier is null then raise exception '계정 등급을 확인할 수 없습니다.' using errcode = '42501'; end if;
  select * into v_trip from public.trips where id = p_trip_id and owner_id = v_user for update;
  if not found then raise exception '여행을 찾을 수 없습니다.' using errcode = '42501'; end if;
  if v_trip.revision <> p_expected_revision then raise exception '여행이 다른 곳에서 변경됐습니다.' using errcode = '40001'; end if;
  insert into public.trip_dates(trip_id, travel_date) values (p_trip_id, p_date);
  update public.trips set revision = revision + 1 where id = p_trip_id;
end;
$$;

create function public.add_trip_place(p_trip_id uuid, p_name text, p_category text default null, p_memo text default '', p_expected_revision bigint default 1)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_trip public.trips%rowtype;
  v_tier text;
  v_limit integer;
  v_count bigint;
  v_place uuid;
begin
  if v_user is null then raise exception '로그인이 필요합니다.' using errcode = '42501'; end if;
  if length(trim(coalesce(p_name, ''))) not between 1 and 200 then
    raise exception '장소 이름은 1자 이상 200자 이하여야 합니다.' using errcode = '22023';
  end if;
  perform 1 from public.app_settings where id = true for share;
  select tier into v_tier from public.user_profiles where user_id = v_user for update;
  if v_tier is null then raise exception '계정 등급을 확인할 수 없습니다.' using errcode = '42501'; end if;
  select * into v_trip from public.trips where id = p_trip_id and owner_id = v_user for update;
  if not found then raise exception '여행을 찾을 수 없습니다.' using errcode = '42501'; end if;
  if v_trip.revision <> p_expected_revision then raise exception '여행이 다른 곳에서 변경됐습니다.' using errcode = '40001'; end if;
  select place_limit into v_limit from public.tier_limits where tier = v_tier;
  select count(*) into v_count from public.places where trip_id = p_trip_id;
  if v_count >= v_limit then raise exception '여행의 장소 저장 한도에 도달했습니다.' using errcode = 'P0001'; end if;
  insert into public.places(trip_id, name, category, memo)
    values (p_trip_id, trim(p_name), p_category, coalesce(p_memo, '')) returning id into v_place;
  update public.trips set revision = revision + 1 where id = p_trip_id;
  return v_place;
end;
$$;

-- These operator functions are callable only with a server-side service_role credential.
create function public.operator_set_user_access(p_user_id uuid, p_tier text, p_is_admin boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() <> 'service_role' then raise exception '운영자 권한이 필요합니다.' using errcode = '42501'; end if;
  perform 1 from public.app_settings where id = true for share;
  update public.user_profiles set tier = p_tier, is_admin = p_is_admin where user_id = p_user_id;
  if not found then raise exception '대상 사용자를 찾을 수 없습니다.' using errcode = 'P0002'; end if;
end;
$$;

create function public.operator_set_tier_limits(p_tier text, p_trip_limit integer, p_place_limit integer, p_expected_revision bigint)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_revision bigint;
begin
  if auth.role() <> 'service_role' then raise exception '운영자 권한이 필요합니다.' using errcode = '42501'; end if;
  select revision into v_revision from public.app_settings where id = true for update;
  if v_revision <> p_expected_revision then raise exception '등급 한도가 다른 곳에서 변경됐습니다.' using errcode = '40001'; end if;
  if p_trip_limit <= 0 or p_place_limit <= 0 then raise exception '한도는 양의 정수여야 합니다.' using errcode = '22023'; end if;
  update public.tier_limits set trip_limit = p_trip_limit, place_limit = p_place_limit where tier = p_tier;
  if not found then raise exception '등급을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  update public.app_settings set revision = revision + 1 where id = true returning revision into v_revision;
  return v_revision;
end;
$$;

revoke all on function public.create_trip(text), public.add_trip_date(uuid, date, bigint),
  public.add_trip_place(uuid, text, text, text, bigint),
  public.operator_set_user_access(uuid, text, boolean),
  public.operator_set_tier_limits(text, integer, integer, bigint) from public, anon;
grant execute on function public.create_trip(text), public.add_trip_date(uuid, date, bigint),
  public.add_trip_place(uuid, text, text, text, bigint) to authenticated;
grant execute on function public.operator_set_user_access(uuid, text, boolean),
  public.operator_set_tier_limits(text, integer, integer, bigint) to service_role;
