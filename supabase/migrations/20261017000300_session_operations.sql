-- Receipts also bind create/end requests, so a retry cannot target another operation.
create table public.operation_receipts (
  group_id uuid not null references public.groups(id),
  request_id uuid not null,
  kind text not null check (kind in ('create', 'confirm', 'end')),
  payload jsonb not null,
  response jsonb not null,
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (group_id, request_id)
);
create table public.match_confirmations (
  group_id uuid not null,
  session_id uuid not null,
  match_id uuid primary key,
  request_id uuid not null,
  next_match_id uuid not null unique,
  foreign key (group_id, request_id) references public.operation_receipts(group_id, request_id),
  foreign key (group_id, session_id, match_id) references public.matches(group_id, session_id, id),
  foreign key (group_id, session_id, next_match_id) references public.matches(group_id, session_id, id),
  check (match_id <> next_match_id)
);
create index confirmations_group on public.match_confirmations(group_id, session_id);
alter table public.operation_receipts enable row level security;
alter table public.match_confirmations enable row level security;
revoke all on public.operation_receipts, public.match_confirmations from anon, authenticated;
grant select on public.operation_receipts, public.match_confirmations to authenticated;
create policy receipt_read on public.operation_receipts for select to authenticated
  using (private.is_group_member(group_id));
create policy confirmation_read on public.match_confirmations for select to authenticated
  using (private.is_group_member(group_id));
create trigger receipts_immutable before update or delete on public.operation_receipts
  for each row execute function private.reject_historical_change();
create trigger confirmations_immutable before update or delete on public.match_confirmations
  for each row execute function private.reject_historical_change();

create function private.require_member(p_group_id uuid, p_actor_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_actor_id is null or not exists (select 1 from public.memberships
    where group_id = p_group_id and user_id = p_actor_id) then
    raise exception 'Group access denied' using errcode = '42501';
  end if;
end;
$$;

-- Always called after the session lock (except creation, which has no existing session).
create function private.replay_receipt(p_group_id uuid, p_request_id uuid, p_kind text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_receipt public.operation_receipts;
begin
  if p_request_id is null then
    raise exception 'Request ID required' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_group_id::text || ':' || p_request_id::text, 0));
  select * into v_receipt from public.operation_receipts
    where group_id = p_group_id and request_id = p_request_id;

  if found then
    if v_receipt.kind <> p_kind or v_receipt.payload <> p_payload then
      raise exception 'Request ID already used for a different operation' using errcode = '23505';
    end if;
    return v_receipt.response;
  end if;

  return null;
end;
$$;

-- p_assignment has teamA, teamB and restingPlayerIds arrays, matching the TS domain.
create function private.publish_match(p_session public.sessions, p_sequence integer, p_assignment jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_a uuid[];
  v_b uuid[];
  v_rest uuid[];
  v_all uuid[];
  v_active uuid[];
begin
  if p_assignment is null or jsonb_typeof(p_assignment) <> 'object'
    or jsonb_typeof(p_assignment -> 'teamA') is distinct from 'array'
    or jsonb_typeof(p_assignment -> 'teamB') is distinct from 'array'
    or jsonb_typeof(p_assignment -> 'restingPlayerIds') is distinct from 'array' then
    raise exception 'Assignment arrays required' using errcode = '22023';
  end if;

  select array_agg(value::uuid order by ordinal) into v_a
    from jsonb_array_elements_text(p_assignment -> 'teamA') with ordinality as x(value, ordinal);
  select array_agg(value::uuid order by ordinal) into v_b
    from jsonb_array_elements_text(p_assignment -> 'teamB') with ordinality as x(value, ordinal);
  select array_agg(value::uuid order by ordinal) into v_rest
    from jsonb_array_elements_text(p_assignment -> 'restingPlayerIds') with ordinality as x(value, ordinal);

  if cardinality(v_a) is distinct from 2 or cardinality(v_b) is distinct from 2
    or cardinality(v_rest) not in (1,2) or v_rest is null then
    raise exception 'Expected doubles teams and one or two resting players' using errcode = '23514';
  end if;

  v_all := v_a || v_b || v_rest;
  select array_agg(player_id order by player_id) into v_active
    from public.session_players where session_id = p_session.id and is_active;
  if (select array_agg(x order by x) from unnest(v_all) x) is distinct from v_active
    or (select count(distinct x) from unnest(v_all) x) <> cardinality(v_all) then
    raise exception 'Assignment must contain every active player exactly once' using errcode = '23514';
  end if;

  insert into public.matches(group_id, session_id, sequence, match_points, scheduler_version)
    values (p_session.group_id, p_session.id, p_sequence, p_session.match_points, p_session.scheduler_version)
    returning id into v_id;
  insert into public.match_participants(group_id, session_id, match_id, player_id, slot)
    select p_session.group_id, p_session.id, v_id, player_id, slot
    from unnest(v_all, (array['a1','a2','b1','b2','rest1','rest2'])[1:cardinality(v_all)]) as x(player_id, slot);

  return v_id;
end;
$$;

-- Trusted Edge adapter only: the caller identity must come from verified Auth, never HTTP JSON.
create function public.create_session(
  p_actor_id uuid, p_group_id uuid, p_request_id uuid,
  p_player_ids uuid[], p_assignment jsonb,
  p_scheduler_version text default 'lexicographic-v1'
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_session public.sessions;
  v_payload jsonb;
  v_response jsonb;
  v_match_id uuid;
begin
  perform private.require_member(p_group_id, p_actor_id);
  v_payload := jsonb_build_object('players', p_player_ids);
  v_response := private.replay_receipt(p_group_id, p_request_id, 'create', v_payload);
  if v_response is not null then return v_response; end if;

  if p_player_ids is null or cardinality(p_player_ids) not in (5,6)
    or cardinality(p_player_ids) <> (select count(distinct x) from unnest(p_player_ids) x) then
    raise exception 'Expected five or six distinct players' using errcode = '23514';
  end if;
  if p_scheduler_version is distinct from 'lexicographic-v1' then
    raise exception 'Unsupported scheduler version' using errcode = '22023';
  end if;

  -- Lock players in stable order so concurrent archiving cannot race session creation.
  perform 1 from public.players where group_id = p_group_id and id = any(p_player_ids)
    order by id for update;
  if (select count(*) from public.players
    where group_id = p_group_id and id = any(p_player_ids) and archived_at is null) <> cardinality(p_player_ids) then
    raise exception 'Players must be active members of this group' using errcode = '23514';
  end if;

  insert into public.sessions(group_id) values (p_group_id) returning * into v_session;
  insert into public.session_players(group_id, session_id, player_id, display_name_snapshot, roster_order)
    select p_group_id, v_session.id, p.id, p.name, x.ordinal
    from unnest(p_player_ids) with ordinality as x(id, ordinal)
    join public.players p on p.id = x.id;
  v_match_id := private.publish_match(v_session, 1, p_assignment);

  v_response := jsonb_build_object('sessionId', v_session.id, 'matchId', v_match_id, 'revision', 0);
  insert into public.operation_receipts(group_id, request_id, kind, payload, response, actor_id)
    values (p_group_id, p_request_id, 'create', v_payload, v_response, p_actor_id);
  return v_response;
end;
$$;

-- Numeric arguments prevent PostgREST/Postgres from silently rounding fractional integer inputs.
create function public.commit_match_result(
  p_actor_id uuid, p_session_id uuid, p_match_id uuid, p_request_id uuid,
  p_score_a numeric, p_score_b numeric, p_expected_revision bigint, p_assignment jsonb,
  p_scheduler_version text default 'lexicographic-v1'
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_session public.sessions;
  v_match public.matches;
  v_payload jsonb;
  v_response jsonb;
  v_next_id uuid;
begin
  select * into v_session from public.sessions where id = p_session_id for update;
  if not found then raise exception 'Session unavailable' using errcode = '42501'; end if;
  perform private.require_member(v_session.group_id, p_actor_id);

  v_payload := jsonb_build_object('sessionId', p_session_id, 'matchId', p_match_id,
    'scoreA', p_score_a, 'scoreB', p_score_b);
  v_response := private.replay_receipt(v_session.group_id, p_request_id, 'confirm', v_payload);
  if v_response is not null then return v_response; end if;

  select * into v_match from public.matches where id = p_match_id and session_id = p_session_id;
  if not found then raise exception 'Match unavailable' using errcode = '22023'; end if;

  -- Match-level replay works with a new request ID, even after the session has ended.
  if v_match.status = 'completed' then
    if p_score_a is distinct from v_match.score_a or p_score_b is distinct from v_match.score_b then
      raise exception 'Match already has a different result' using errcode = '23505';
    end if;
    select r.response into v_response from public.match_confirmations c
      join public.operation_receipts r on r.group_id = c.group_id and r.request_id = c.request_id
      where c.match_id = p_match_id;
    if v_response is null then
      raise exception 'Confirmation receipt missing' using errcode = '23514';
    end if;
    insert into public.operation_receipts(group_id, request_id, kind, payload, response, actor_id)
      values (v_session.group_id, p_request_id, 'confirm', v_payload, v_response, p_actor_id);
    return v_response;
  end if;

  if v_session.status <> 'active' or v_match.status <> 'published' then
    raise exception 'Session or match is no longer active' using errcode = '23505';
  end if;
  if p_expected_revision is distinct from v_session.revision then
    raise exception 'Stale session revision' using errcode = '40001';
  end if;
  if p_scheduler_version is distinct from v_session.scheduler_version then
    raise exception 'Unsupported scheduler version' using errcode = '22023';
  end if;
  if p_score_a is null or p_score_b is null
    or p_score_a <> trunc(p_score_a) or p_score_b <> trunc(p_score_b)
    or not (p_score_a between 0 and v_session.match_points)
    or not (p_score_b between 0 and v_session.match_points)
    or p_score_a + p_score_b <> v_session.match_points then
    raise exception 'Invalid integer scores or combined total' using errcode = '23514';
  end if;

  update public.matches set status = 'completed', score_a = p_score_a, score_b = p_score_b,
    confirmed_at = clock_timestamp(), confirmed_by = p_actor_id where id = p_match_id;
  v_next_id := private.publish_match(v_session, v_match.sequence + 1, p_assignment);
  update public.sessions set revision = revision + 1 where id = p_session_id;

  v_response := jsonb_build_object('sessionId', p_session_id, 'completedMatchId', p_match_id,
    'nextMatchId', v_next_id, 'scoreA', p_score_a, 'scoreB', p_score_b,
    'revision', v_session.revision + 1);
  insert into public.operation_receipts(group_id, request_id, kind, payload, response, actor_id)
    values (v_session.group_id, p_request_id, 'confirm', v_payload, v_response, p_actor_id);
  insert into public.match_confirmations(group_id, session_id, match_id, request_id, next_match_id)
    values (v_session.group_id, p_session_id, p_match_id, p_request_id, v_next_id);
  return v_response;
end;
$$;

create function public.end_session(p_session_id uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_session public.sessions;
  v_payload jsonb := jsonb_build_object('sessionId', p_session_id);
  v_response jsonb;
begin
  select * into v_session from public.sessions where id = p_session_id for update;
  if not found then raise exception 'Session unavailable' using errcode = '42501'; end if;
  perform private.require_member(v_session.group_id, auth.uid());
  v_response := private.replay_receipt(v_session.group_id, p_request_id, 'end', v_payload);
  if v_response is not null then return v_response; end if;

  if v_session.status = 'active' then
    update public.matches set status = 'cancelled', cancelled_at = clock_timestamp()
      where session_id = p_session_id and status = 'published';
    update public.sessions set status = 'ended', ended_at = clock_timestamp(), revision = revision + 1
      where id = p_session_id returning * into v_session;
  end if;

  v_response := jsonb_build_object('sessionId', p_session_id, 'status', v_session.status,
    'endedAt', v_session.ended_at, 'revision', v_session.revision);
  insert into public.operation_receipts(group_id, request_id, kind, payload, response, actor_id)
    values (v_session.group_id, p_request_id, 'end', v_payload, v_response, auth.uid());
  return v_response;
end;
$$;

create function public.create_player(p_group_id uuid, p_name text)
returns public.players language plpgsql security definer set search_path = '' as $$
declare v_player public.players;
begin
  perform private.require_member(p_group_id, auth.uid());
  insert into public.players(group_id, name) values (p_group_id, btrim(p_name)) returning * into v_player;
  return v_player;
end;
$$;

create function public.update_player(p_player_id uuid, p_name text, p_archive boolean default false)
returns public.players language plpgsql security definer set search_path = '' as $$
declare v_player public.players;
begin
  select * into v_player from public.players where id = p_player_id for update;
  if not found then raise exception 'Player unavailable' using errcode = '42501'; end if;
  perform private.require_member(v_player.group_id, auth.uid());
  if p_archive is null then raise exception 'Archive flag required' using errcode = '22023'; end if;

  update public.players set name = btrim(p_name),
    archived_at = case when p_archive then coalesce(archived_at, clock_timestamp()) else null end
    where id = p_player_id returning * into v_player;
  return v_player;
end;
$$;

-- One SQL statement gives the Edge scheduler a consistent revision/roster/history snapshot.
-- Returned rows retain DB naming; the upcoming Edge adapter maps them into domain models.
create function public.get_session_snapshot(p_session_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'session', to_jsonb(s),
    'players', (select coalesce(jsonb_agg(to_jsonb(p) order by p.roster_order), '[]'::jsonb)
      from public.session_players p where p.session_id = s.id),
    'matches', (select coalesce(jsonb_agg(to_jsonb(m) || jsonb_build_object(
      'participants', (select jsonb_agg(to_jsonb(p) order by p.slot)
        from public.match_participants p where p.match_id = m.id)) order by m.sequence), '[]'::jsonb)
      from public.matches m where m.session_id = s.id)
  ) from public.sessions s where s.id = p_session_id;
$$;

-- Explicit grants: newly created functions otherwise default to PUBLIC EXECUTE.
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_group_member(uuid) to authenticated;
revoke all on function public.create_session(uuid,uuid,uuid,uuid[],jsonb,text) from public, anon, authenticated;
revoke all on function public.commit_match_result(uuid,uuid,uuid,uuid,numeric,numeric,bigint,jsonb,text) from public, anon, authenticated;
grant execute on function public.create_session(uuid,uuid,uuid,uuid[],jsonb,text) to service_role;
grant execute on function public.commit_match_result(uuid,uuid,uuid,uuid,numeric,numeric,bigint,jsonb,text) to service_role;

revoke all on function public.end_session(uuid,uuid), public.create_player(uuid,text),
  public.update_player(uuid,text,boolean), public.get_session_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.end_session(uuid,uuid), public.create_player(uuid,text),
  public.update_player(uuid,text,boolean), public.get_session_snapshot(uuid) to authenticated;
