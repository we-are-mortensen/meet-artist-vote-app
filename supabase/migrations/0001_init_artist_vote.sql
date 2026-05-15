-- Artist Vote — gamification schema
-- Replaces the legacy poll_votes table with identified voting,
-- per-round scoring history, and a tunable scoring RPC.

-- 1. Drop legacy table (test data only; safe per design decision).
drop table if exists public.poll_votes;

-- 2. Tables ----------------------------------------------------------------

create table if not exists public.participants (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null unique,
  points      int         not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.polls (
  id                      text        primary key,
  correct_participant_id  uuid        not null references public.participants(id),
  status                  text        not null default 'voting'
    check (status in ('voting', 'revealed', 'scored')),
  scored_at               timestamptz,
  created_at              timestamptz not null default now()
);

create table if not exists public.votes (
  poll_id              text        not null references public.polls(id) on delete cascade,
  voter_participant_id uuid        not null references public.participants(id),
  voted_for_id         uuid        not null references public.participants(id),
  timestamp            bigint      not null,
  primary key (poll_id, voter_participant_id)
);

create table if not exists public.score_events (
  id             bigserial   primary key,
  poll_id        text        not null references public.polls(id) on delete cascade,
  participant_id uuid        not null references public.participants(id),
  delta          int         not null,
  reason         text        not null
    check (reason in ('nobody_guessed', 'all_guessed', 'correct_guess', 'artist_per_wrong_vote')),
  created_at     timestamptz not null default now(),
  unique (poll_id, participant_id, reason)
);

-- 3. Realtime publication --------------------------------------------------
-- Drop-and-add is idempotent. participants is the only table we need CDC on;
-- ephemeral vote / reveal / show-leaderboard events ride on Realtime broadcast.
alter publication supabase_realtime add table public.participants;

-- 4. Scoring RPC -----------------------------------------------------------

create or replace function public.score_poll(p_poll_id text)
returns void
language plpgsql
as $$
declare
  -- Tunable scoring constants. Change these to retune the game.
  c_artist_nobody_guessed int := 3;
  c_each_when_all_guessed int := 1;
  c_correct_guess         int := 3;

  v_correct_id   uuid;
  v_total_votes  int;
  v_correct_cnt  int;
  v_wrong_cnt    int;
begin
  -- 1. Lock the poll row. Bail out if already scored or not yet revealed.
  select correct_participant_id
    into v_correct_id
    from public.polls
   where id = p_poll_id
     and scored_at is null
     and status   = 'revealed'
   for update;

  if not found then
    return;
  end if;

  -- 2. Tally. Artist cannot vote, but defensively exclude any self-row.
  select count(*) into v_total_votes
    from public.votes
   where poll_id = p_poll_id
     and voter_participant_id <> v_correct_id;

  select count(*) into v_correct_cnt
    from public.votes
   where poll_id = p_poll_id
     and voter_participant_id <> v_correct_id
     and voted_for_id = v_correct_id;

  v_wrong_cnt := v_total_votes - v_correct_cnt;

  -- 3. Apply rules.
  if v_total_votes = 0 then
    null;  -- no voters, no scoring

  elsif v_correct_cnt = 0 then
    insert into public.score_events(poll_id, participant_id, delta, reason)
    values (p_poll_id, v_correct_id, c_artist_nobody_guessed, 'nobody_guessed');

  elsif v_correct_cnt = v_total_votes then
    insert into public.score_events(poll_id, participant_id, delta, reason)
    select p_poll_id, voter_participant_id, c_each_when_all_guessed, 'all_guessed'
      from public.votes
     where poll_id = p_poll_id
       and voter_participant_id <> v_correct_id;

  else
    insert into public.score_events(poll_id, participant_id, delta, reason)
    values (p_poll_id, v_correct_id, v_wrong_cnt, 'artist_per_wrong_vote');

    insert into public.score_events(poll_id, participant_id, delta, reason)
    select p_poll_id, voter_participant_id, c_correct_guess, 'correct_guess'
      from public.votes
     where poll_id = p_poll_id
       and voter_participant_id <> v_correct_id
       and voted_for_id = v_correct_id;
  end if;

  -- 4. Apply summed deltas to participants.points.
  update public.participants p
     set points = points + agg.total_delta
    from (
      select participant_id, sum(delta) as total_delta
        from public.score_events
       where poll_id = p_poll_id
       group by participant_id
    ) agg
   where p.id = agg.participant_id;

  -- 5. Mark scored.
  update public.polls
     set scored_at = now(),
         status    = 'scored'
   where id = p_poll_id;
end;
$$;
