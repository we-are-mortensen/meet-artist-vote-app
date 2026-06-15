-- Participants can be deactivated: an inactive participant keeps their points
-- and full vote history, but can no longer be picked as self/artist, voted for,
-- or vote. They still appear (frozen) on the leaderboard.
--
-- Defaults to true so existing and new rows behave exactly as before until a
-- participant is explicitly deactivated in Supabase Studio.
alter table public.participants
  add column if not exists active boolean not null default true;
