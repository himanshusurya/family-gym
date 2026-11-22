-- Family Gym: the only table. Plans are NOT stored here (they live in plans/*.json in the repo).
create table if not exists public.set_log (
  cid        uuid primary key,
  profile    text not null check (profile ~ '^[a-z0-9-]{1,32}$'),
  day        date not null,
  session    text not null check (length(session) <= 16),
  ex         text not null check (length(ex) <= 64),
  set_no     smallint not null check (set_no between 1 and 30),
  kg         numeric(6,2) check (kg is null or (kg >= 0 and kg <= 500)),
  reps       smallint not null check (reps between 0 and 999),
  deleted    boolean not null default false,
  logged_at  timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  srv_at     timestamptz not null default clock_timestamp()  -- server write time, used for incremental pulls
);
create index if not exists set_log_profile_day on public.set_log (profile, day desc);
create index if not exists set_log_srv_at on public.set_log (srv_at);

create or replace function public.set_log_touch() returns trigger language plpgsql as $$
begin new.srv_at := clock_timestamp(); return new; end $$;
drop trigger if exists set_log_touch on public.set_log;
create trigger set_log_touch before insert or update on public.set_log for each row execute function public.set_log_touch();

alter table public.set_log enable row level security;
revoke all on public.set_log from anon;
grant select, insert, update on public.set_log to authenticated;
drop policy if exists family_all on public.set_log;
create policy family_all on public.set_log for all to authenticated using (true) with check (true);

-- keep-alive target for the GitHub Action (free projects pause after 7 days idle)
create or replace function public.ping() returns int language sql stable as $$ select 1 $$;
grant execute on function public.ping() to anon;
