-- Enable Row-Level Security (RLS) on the Artist Vote game tables and add the minimal policies
-- that keep the app working. The app talks to the DB with the publishable (anon) key from the
-- browser, so these policies gate by OPERATION and TABLE — RLS cannot restrict columns or tell
-- clients apart, so any write the app must do client-side is open to anyone holding the key.
-- What RLS buys: no anon deletes, no direct anon writes to participants/score_events/votes_audit
-- (points can't be forged), and the roster/scoring internals are restricted.
--
-- NOTE: the companion dashboard adds its own tables (poll_drawings, legacy_drawings) and the
-- `drawings` Storage bucket, with their own RLS in that repo's migration. This migration governs
-- only the Artist Vote game tables + the score_poll function. Idempotent (safe to re-run).

-- ============================================================================
-- score_poll() → SECURITY DEFINER
-- The function is SECURITY INVOKER by default, so under RLS it would need anon write access to
-- score_events + participants (a hole: anyone with the public key could forge points). Making it
-- DEFINER lets it write those tables as the owner (bypassing RLS) while anon keeps NO direct
-- write on them. No function body change — only the security context + a fixed search_path.
-- ============================================================================
alter function public.score_poll(text) security definer;
alter function public.score_poll(text) set search_path = public;

-- ============================================================================
-- participants — read by the app (and its realtime subscription); points mutated only inside
-- score_poll (definer); the `active` flag + roster are managed in Studio (service role).
-- ============================================================================
alter table public.participants enable row level security;
drop policy if exists "participants read" on public.participants;
create policy "participants read" on public.participants for select using (true);
-- no anon insert/update/delete.

-- ============================================================================
-- polls — read by the app; created/updated by the host from the browser (createPoll,
-- revealPoll, markArtistVoted); status also advanced to 'scored' inside score_poll (definer).
-- ============================================================================
alter table public.polls enable row level security;
drop policy if exists "polls read" on public.polls;
drop policy if exists "polls insert" on public.polls;
drop policy if exists "polls update" on public.polls;
create policy "polls read"   on public.polls for select using (true);
create policy "polls insert" on public.polls for insert with check (true);
create policy "polls update" on public.polls for update using (true) with check (true);
-- no anon delete (poll wipes are admin/service only).

-- ============================================================================
-- votes — read by the app (and realtime); upserted by voters from the browser. The upsert hits
-- both insert (first vote) and update (re-vote) paths, so both are needed.
-- ============================================================================
alter table public.votes enable row level security;
drop policy if exists "votes read" on public.votes;
drop policy if exists "votes insert" on public.votes;
drop policy if exists "votes update" on public.votes;
create policy "votes read"   on public.votes for select using (true);
create policy "votes insert" on public.votes for insert with check (true);
create policy "votes update" on public.votes for update using (true) with check (true);
-- no anon delete (cascade delete on poll removal is admin/service only).

-- ============================================================================
-- score_events — read by the app; written ONLY inside score_poll (definer).
-- ============================================================================
alter table public.score_events enable row level security;
drop policy if exists "score_events read" on public.score_events;
create policy "score_events read" on public.score_events for select using (true);
-- no anon insert/update/delete.

-- ============================================================================
-- votes_audit — append-only log written by the SECURITY DEFINER trigger votes_audit_fn(). RLS
-- on with NO policies => not readable/writable by anon; the trigger still writes it fine.
-- ============================================================================
alter table public.votes_audit enable row level security;
