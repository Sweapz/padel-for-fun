create function private.is_group_member(p_group_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships
    where group_id = p_group_id and user_id = (select auth.uid()));
$$;

revoke all on all functions in schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_group_member(uuid) to authenticated;

alter table public.groups enable row level security;
alter table public.memberships enable row level security;
alter table public.players enable row level security;
alter table public.sessions enable row level security;
alter table public.session_players enable row level security;
alter table public.matches enable row level security;
alter table public.match_participants enable row level security;

revoke all on public.groups, public.memberships, public.players, public.sessions,
  public.session_players, public.matches, public.match_participants from anon, authenticated;
grant select on public.groups, public.memberships, public.players, public.sessions,
  public.session_players, public.matches, public.match_participants to authenticated;

create policy group_read on public.groups for select to authenticated
  using (private.is_group_member(id));
create policy membership_read on public.memberships for select to authenticated
  using (user_id = (select auth.uid()));
create policy player_read on public.players for select to authenticated
  using (private.is_group_member(group_id));
create policy session_read on public.sessions for select to authenticated
  using (private.is_group_member(group_id));
create policy roster_read on public.session_players for select to authenticated
  using (private.is_group_member(group_id));
create policy match_read on public.matches for select to authenticated
  using (private.is_group_member(group_id));
create policy participant_read on public.match_participants for select to authenticated
  using (private.is_group_member(group_id));
