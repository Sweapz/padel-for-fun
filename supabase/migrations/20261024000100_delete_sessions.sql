-- Keep only deletion/request identifiers for audit and retry safety, never scores or teams.
create table private.session_deletions (
  session_id uuid primary key,
  group_id uuid not null references public.groups(id),
  deleted_by uuid not null references auth.users(id),
  deleted_at timestamptz not null default clock_timestamp(),
  deleting_transaction xid8 not null default pg_current_xact_id()
);
create table private.deleted_session_requests (
  group_id uuid not null references public.groups(id),
  request_id uuid not null,
  session_id uuid not null references private.session_deletions(session_id),
  primary key (group_id, request_id)
);
revoke all on private.session_deletions, private.deleted_session_requests
  from public, anon, authenticated, service_role;

-- Historical writes remain forbidden. Only the authorized deletion transaction may
-- remove rows belonging to its locked session; no global trigger bypass is used.
create or replace function private.reject_historical_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_session_id uuid;
begin
  if tg_op = 'DELETE' then
    v_session_id := case
      when tg_table_name = 'sessions' then (to_jsonb(old)->>'id')::uuid
      when tg_table_name = 'operation_receipts' then (to_jsonb(old)->'response'->>'sessionId')::uuid
      else (to_jsonb(old)->>'session_id')::uuid
    end;

    if exists (select 1 from private.session_deletions
      where session_id = v_session_id and deleting_transaction = pg_current_xact_id()) then
      return old;
    end if;
  end if;

  raise exception 'Historical records are immutable' using errcode = '23514';
end;
$$;

create or replace function private.replay_receipt(
  p_group_id uuid, p_request_id uuid, p_kind text, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_receipt public.operation_receipts;
begin
  if p_request_id is null then
    raise exception 'Request ID required' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_group_id::text || ':' || p_request_id::text, 0));
  if exists (select 1 from private.deleted_session_requests
    where group_id = p_group_id and request_id = p_request_id) then
    raise exception 'This request belongs to a deleted session' using errcode = '23505';
  end if;

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

create function public.delete_session(p_session_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_session public.sessions;
  v_group_id uuid;
begin
  select * into v_session from public.sessions where id = p_session_id for update;
  if not found then
    select group_id into v_group_id from private.session_deletions where session_id = p_session_id;
    if not found then raise exception 'Session unavailable' using errcode = '42501'; end if;
    perform private.require_member(v_group_id, auth.uid());
    return;
  end if;

  perform private.require_member(v_session.group_id, auth.uid());
  insert into private.session_deletions(session_id, group_id, deleted_by)
    values (p_session_id, v_session.group_id, auth.uid());
  insert into private.deleted_session_requests(group_id, request_id, session_id)
    select group_id, request_id, p_session_id from public.operation_receipts
    where group_id = v_session.group_id and response->>'sessionId' = p_session_id::text;

  delete from public.match_confirmations where session_id = p_session_id;
  delete from public.match_participants where session_id = p_session_id;
  delete from public.matches where session_id = p_session_id;
  delete from public.session_players where session_id = p_session_id;
  delete from public.operation_receipts
    where group_id = v_session.group_id and response->>'sessionId' = p_session_id::text;
  delete from public.sessions where id = p_session_id;
end;
$$;
revoke all on function public.delete_session(uuid) from public, anon, authenticated;
grant execute on function public.delete_session(uuid) to authenticated;
