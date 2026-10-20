-- Fail without rewriting history if an older installation has multiple active sessions.
-- An operator must explicitly choose which sessions to end before retrying this migration.
do $$
begin
  if exists (
    select 1 from public.sessions where status = 'active'
    group by group_id having count(*) > 1
  ) then
    raise exception 'Multiple active sessions exist in a group. Review and explicitly end extra sessions before retrying this migration.'
      using errcode = '23514';
  end if;
end;
$$;

-- The index is the final concurrency boundary, including disjoint player rosters.
-- Existing create_session receipt replay runs before insertion and remains idempotent.
create unique index sessions_one_active_per_group
  on public.sessions(group_id) where status = 'active';
