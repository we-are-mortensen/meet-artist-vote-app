-- Track when the artist has acknowledged the round by hitting submit, even
-- though their "vote" is intentionally not written to the votes table. The
-- main stage uses this flag (delivered via Postgres CDC) to erase the artist
-- from the "Falten per votar" list while their screen stays indistinguishable
-- from other participants'.
alter table public.polls
  add column if not exists artist_voted boolean not null default false;

-- Add polls to the realtime publication so the main stage receives UPDATE
-- events when artist_voted flips.
do $$
begin
  alter publication supabase_realtime add table public.polls;
exception
  when duplicate_object then null;
end $$;
