-- Audit log for the votes table. Every INSERT/UPDATE/DELETE writes a row here
-- so we can reconstruct what happened when a vote looks wrong — including the
-- case where an UPSERT silently overwrites a previous "last vote wins" entry.

create table if not exists public.votes_audit (
  id            bigserial primary key,
  changed_at    timestamptz not null default now(),
  operation     text        not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  db_user       text        not null default current_user,
  -- auth.uid() is null for anon/service-role writes; useful when RLS is on.
  auth_uid      uuid                 default auth.uid(),
  old_row       jsonb,
  new_row       jsonb
);

create index if not exists votes_audit_changed_at_idx
  on public.votes_audit (changed_at desc);

create index if not exists votes_audit_voter_idx
  on public.votes_audit ((coalesce(new_row->>'voter_participant_id',
                                   old_row->>'voter_participant_id')));

create index if not exists votes_audit_poll_idx
  on public.votes_audit ((coalesce(new_row->>'poll_id',
                                   old_row->>'poll_id')));

create or replace function public.votes_audit_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    insert into public.votes_audit (operation, new_row)
    values ('INSERT', to_jsonb(new));
    return new;
  elsif (tg_op = 'UPDATE') then
    insert into public.votes_audit (operation, old_row, new_row)
    values ('UPDATE', to_jsonb(old), to_jsonb(new));
    return new;
  elsif (tg_op = 'DELETE') then
    insert into public.votes_audit (operation, old_row)
    values ('DELETE', to_jsonb(old));
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists votes_audit_trg on public.votes;

create trigger votes_audit_trg
  after insert or update or delete on public.votes
  for each row execute function public.votes_audit_fn();
