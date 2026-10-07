-- Safe upgrade for development databases that already applied the initial T05 migration.
-- Existing tables/data and function privileges are retained.
begin;

create or replace function public.add_trip_date(p_trip_id uuid, p_date date, p_expected_revision bigint)
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
  if v_trip.revision is distinct from p_expected_revision then raise exception '여행이 다른 곳에서 변경됐습니다.' using errcode = '40001'; end if;
  insert into public.trip_dates(trip_id, travel_date) values (p_trip_id, p_date);
  update public.trips set revision = revision + 1 where id = p_trip_id;
end;
$$;

create or replace function public.add_trip_place(p_trip_id uuid, p_name text, p_expected_revision bigint, p_category text default null, p_memo text default '')
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
  if v_trip.revision is distinct from p_expected_revision then raise exception '여행이 다른 곳에서 변경됐습니다.' using errcode = '40001'; end if;
  select place_limit into v_limit from public.tier_limits where tier = v_tier;
  select count(*) into v_count from public.places where trip_id = p_trip_id;
  if v_count >= v_limit then raise exception '여행의 장소 저장 한도에 도달했습니다.' using errcode = 'P0001'; end if;
  insert into public.places(trip_id, name, category, memo)
    values (p_trip_id, trim(p_name), p_category, coalesce(p_memo, '')) returning id into v_place;
  update public.trips set revision = revision + 1 where id = p_trip_id;
  return v_place;
end;
$$;

create or replace function public.operator_set_tier_limits(p_tier text, p_trip_limit integer, p_place_limit integer, p_expected_revision bigint)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_revision bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception '운영자 권한이 필요합니다.' using errcode = '42501'; end if;
  select revision into v_revision from public.app_settings where id = true for update;
  if v_revision is distinct from p_expected_revision then raise exception '등급 한도가 다른 곳에서 변경됐습니다.' using errcode = '40001'; end if;
  if p_trip_limit <= 0 or p_place_limit <= 0 then raise exception '한도는 양의 정수여야 합니다.' using errcode = '22023'; end if;
  update public.tier_limits set trip_limit = p_trip_limit, place_limit = p_place_limit where tier = p_tier;
  if not found then raise exception '등급을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  update public.app_settings set revision = revision + 1 where id = true returning revision into v_revision;
  return v_revision;
end;
$$;

commit;
