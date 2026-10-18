-- Initial immutable game format. Rule changes require an explicit migration.
create schema if not exists private;
revoke all on schema private from public;

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name = btrim(name) and length(name) between 1 and 100),
  created_at timestamptz not null default now()
);

create table public.memberships (
  group_id uuid not null references public.groups(id),
  user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index memberships_user_groups on public.memberships(user_id, group_id);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id),
  name text not null check (name = btrim(name) and length(name) between 1 and 100),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (group_id, id)
);
create unique index players_active_names on public.players(group_id, lower(name))
  where archived_at is null;

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id),
  status text not null default 'active' check (status in ('active', 'ended')),
  court_count smallint not null default 1 check (court_count = 1),
  match_points smallint not null default 16 check (match_points = 16),
  rules_version text not null default 'americano-16-v1' check (rules_version = 'americano-16-v1'),
  scheduler_version text not null default 'lexicographic-v1' check (scheduler_version = 'lexicographic-v1'),
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  check ((status = 'ended') = (ended_at is not null)),
  unique (group_id, id),
  unique (group_id, id, match_points)
);
create index sessions_group_created on public.sessions(group_id, created_at desc);

create table public.session_players (
  group_id uuid not null,
  session_id uuid not null,
  player_id uuid not null,
  display_name_snapshot text not null check (length(btrim(display_name_snapshot)) between 1 and 100),
  roster_order smallint not null check (roster_order between 1 and 6),
  is_active boolean not null default true,
  primary key (group_id, session_id, player_id),
  unique (session_id, roster_order),
  foreign key (group_id, session_id) references public.sessions(group_id, id),
  foreign key (group_id, player_id) references public.players(group_id, id)
);
create index session_players_player_history on public.session_players(group_id, player_id, session_id);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null,
  session_id uuid not null,
  sequence integer not null check (sequence > 0),
  status text not null default 'published' check (status in ('published', 'completed', 'cancelled')),
  match_points smallint not null default 16,
  -- numeric intentionally rejects fractions before any narrowing integer cast.
  score_a numeric,
  score_b numeric,
  published_at timestamptz not null default now(),
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  confirmed_by uuid references auth.users(id),
  scheduler_version text not null default 'lexicographic-v1' check (scheduler_version = 'lexicographic-v1'),
  unique (session_id, sequence),
  unique (group_id, session_id, id),
  foreign key (group_id, session_id, match_points)
    references public.sessions(group_id, id, match_points),
  check (
    (status = 'completed' and score_a is not null and score_b is not null
      and score_a = trunc(score_a) and score_b = trunc(score_b)
      and score_a between 0 and match_points and score_b between 0 and match_points
      and score_a + score_b = match_points
      and confirmed_at is not null and confirmed_by is not null and cancelled_at is null)
    or (status = 'published' and score_a is null and score_b is null
      and confirmed_at is null and confirmed_by is null and cancelled_at is null)
    or (status = 'cancelled' and score_a is null and score_b is null
      and confirmed_at is null and confirmed_by is null and cancelled_at is not null)
  )
);
create unique index matches_one_published on public.matches(session_id) where status = 'published';
create index matches_group_session on public.matches(group_id, session_id, sequence);

create table public.match_participants (
  group_id uuid not null,
  session_id uuid not null,
  match_id uuid not null,
  player_id uuid not null,
  slot text not null check (slot in ('a1', 'a2', 'b1', 'b2', 'rest1', 'rest2')),
  primary key (match_id, player_id),
  unique (match_id, slot),
  foreign key (group_id, session_id, match_id) references public.matches(group_id, session_id, id),
  foreign key (group_id, session_id, player_id)
    references public.session_players(group_id, session_id, player_id)
);
create index match_participants_group_session on public.match_participants(group_id, session_id);

create function private.validate_session_state() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_session public.sessions;
  v_count integer;
begin
  if tg_table_name = 'sessions' then
    v_id := new.id;
  else
    v_id := coalesce(new.session_id, old.session_id);
  end if;

  select * into v_session from public.sessions where id = v_id;
  if not found then return null; end if;

  select count(*) into v_count from public.session_players
    where session_id = v_id and is_active;
  if v_count not in (5, 6) then
    raise exception 'A session requires five or six active players' using errcode = '23514';
  end if;

  select count(*) into v_count from public.matches where session_id = v_id and status = 'published';
  if v_count <> (case when v_session.status = 'active' then 1 else 0 end) then
    raise exception 'Session and published match state disagree' using errcode = '23514';
  end if;

  return null;
end;
$$;

create constraint trigger sessions_final_state after insert or update on public.sessions
  deferrable initially deferred for each row execute function private.validate_session_state();
create constraint trigger roster_final_state after insert or update or delete on public.session_players
  deferrable initially deferred for each row execute function private.validate_session_state();
create constraint trigger matches_session_final_state after insert or update or delete on public.matches
  deferrable initially deferred for each row execute function private.validate_session_state();

create function private.validate_match_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_match public.matches;
  v_total integer;
  v_playing integer;
begin
  if tg_table_name = 'matches' then v_id := new.id;
  else v_id := coalesce(new.match_id, old.match_id);
  end if;

  select * into v_match from public.matches where id = v_id;
  if not found then return null; end if;

  select count(*), count(*) filter (where slot in ('a1','a2','b1','b2'))
    into v_total, v_playing from public.match_participants where match_id = v_id;
  if v_total not in (5,6) or v_playing <> 4 then
    raise exception 'Invalid teams or resting players' using errcode = '23514';
  end if;

  if v_match.status = 'published' and exists (
    (select player_id from public.session_players where session_id = v_match.session_id and is_active
      except select player_id from public.match_participants where match_id = v_id)
    union all
    (select player_id from public.match_participants where match_id = v_id
      except select player_id from public.session_players where session_id = v_match.session_id and is_active)
  ) then
    raise exception 'Published assignment must cover the active roster' using errcode = '23514';
  end if;

  return null;
end;
$$;

create constraint trigger matches_final_assignment after insert or update on public.matches
  deferrable initially deferred for each row execute function private.validate_match_assignment();
create constraint trigger participants_final_assignment after insert or update or delete on public.match_participants
  deferrable initially deferred for each row execute function private.validate_match_assignment();

-- No ordinary API for corrections, roster changes, historical deletion, or regeneration yet.
create function private.reject_historical_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Historical records are immutable' using errcode = '23514';
end;
$$;

create trigger participants_immutable before update or delete on public.match_participants
  for each row execute function private.reject_historical_change();
create trigger roster_immutable before update or delete on public.session_players
  for each row execute function private.reject_historical_change();
create trigger sessions_no_delete before delete on public.sessions
  for each row execute function private.reject_historical_change();
create trigger matches_no_delete before delete on public.matches
  for each row execute function private.reject_historical_change();

create function private.guard_match_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status <> 'published' or new.status not in ('completed', 'cancelled')
    or (to_jsonb(new) - array['status','score_a','score_b','confirmed_at','confirmed_by','cancelled_at'])
      <> (to_jsonb(old) - array['status','score_a','score_b','confirmed_at','confirmed_by','cancelled_at']) then
    raise exception 'Published teams and completed history are immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger matches_guard before update on public.matches
  for each row execute function private.guard_match_update();

create function private.guard_session_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status = 'ended' or new.revision <> old.revision + 1
    or (to_jsonb(new) - array['status','ended_at','revision'])
      <> (to_jsonb(old) - array['status','ended_at','revision']) then
    raise exception 'Session rules and ended sessions are immutable; revision must advance' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger sessions_guard before update on public.sessions
  for each row execute function private.guard_session_update();
