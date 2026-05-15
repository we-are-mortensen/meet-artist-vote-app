# Artist Vote Gamification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace host-configured option lists with a fixed `participants` table; introduce identified voting, Dixit-adapted server-side scoring via a Postgres RPC, an identity header showing live points, and a three-state main stage (voting → results → leaderboard).

**Architecture:** Four Supabase tables (`participants`, `polls`, `votes`, `score_events`). A single `score_poll(p_poll_id)` Postgres function applies scoring atomically and is idempotent. Clients use Supabase Realtime Broadcast for ephemeral UX events (`VOTE_CAST`, `REVEAL_RESULTS`, `SHOW_LEADERBOARD`) and Postgres Changes on `participants` for live points updates. Each participant identifies themselves once per browser session; the artist sees a waiting screen instead of the vote UI.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 5, Tailwind 4, `@supabase/supabase-js`, `@googleworkspace/meet-addons`.

**Spec:** `docs/superpowers/specs/2026-05-15-artist-vote-gamification-design.md`

**Verification approach:** This codebase has no test framework. Each task verifies via `npx tsc --noEmit`, `npm run build`, and manual dev-server smoke checks at `https://localhost:3000` (with `NEXT_PUBLIC_DEBUG=1`). The SQL migration is verified by pasting it into the Supabase SQL editor and running the verification queries shown in Task 1.

**Commit-message convention** (from `CLAUDE.md`): `<emoji> <type>: <message>` using only the documented emoji/type pairs.

---

## File structure

### New files

| Path | Responsibility |
|---|---|
| `supabase/migrations/0001_init_artist_vote.sql` | Schema, RPC, publication. Applied manually in Studio. |
| `src/lib/participants.ts` | `listParticipants`, `getParticipantById`, `subscribeToParticipants`. |
| `src/lib/polls.ts` | `createPoll`, `getPoll`, `revealPoll`. |
| `src/lib/votes.ts` | `saveVote`, `loadVotes`. Replaces `voteDatabase.ts`. |
| `src/lib/scoring.ts` | `scorePoll` (RPC wrapper), `loadScoreEvents`. |
| `src/lib/identity.ts` | sessionStorage wrapper: `getIdentity`, `setIdentity`, `clearIdentity`. |
| `src/components/IdentityHeader.tsx` | Name + live points + "Canviar". |
| `src/components/IdentityPicker.tsx` | First-time identity selector. |
| `src/components/ArtistWaitingView.tsx` | "Avui l'artista ets tu" screen. |
| `src/components/LeaderboardView.tsx` | Sorted standings with `+N` deltas. |
| `src/components/VotingProgress.tsx` | Extracted live vote counter for main stage. |

### Renamed / heavily rewritten

| From → To | Reason |
|---|---|
| `src/components/VoteResults.tsx` → `src/components/ResultsView.tsx` | Adds correct-guessers highlight; new vote shape. |
| `src/lib/voteDatabase.ts` → `src/lib/votes.ts` | Identified votes, new column names. |
| `src/types/poll.types.ts` (rewritten) | New shape: `Participant`, `Vote { voterParticipantId, votedForId }`, `ScoreEvent`, `PollState { pollId, correctParticipantId, participants }`. Drops `PredefinedList*`, `optionsSource`, `round`. |
| `src/utils/voteCalculations.ts` (trimmed) | Keep `generatePollId`; adapt `calculateResults`; drop voter-ID/parse/validate helpers. |
| `src/hooks/useVoteChannel.ts` (extended) | Add `SHOW_LEADERBOARD` event + `sendShowLeaderboard`. |
| `src/app/sidepanel/page.tsx` (rewritten) | Removes option configuration; loads participants; picks artist; creates poll row. |
| `src/app/activitysidepanel/page.tsx` (rewritten) | Identity branch: picker / artist-waiting / vote UI; two host buttons. |
| `src/app/mainstage/page.tsx` (rewritten) | Three-state router. |

### Deleted

- `src/data/predefinedOptions.json`
- `src/components/VoteConfirmation.tsx`

---

## Task 1 — Database schema, RPC, and publication

**Files:**
- Create: `supabase/migrations/0001_init_artist_vote.sql`

This task creates the in-repo migration AND applies it to the live Supabase project. The implementer pastes the SQL into the Supabase SQL editor and runs it.

- [ ] **Step 1.1 — Write the migration file**

Create `supabase/migrations/0001_init_artist_vote.sql` with:

```sql
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
```

- [ ] **Step 1.2 — Apply the migration in Supabase Studio**

1. Open Supabase Studio → SQL Editor for the `isghotnbpvxswndongod` project.
2. Paste the contents of `supabase/migrations/0001_init_artist_vote.sql`.
3. Click Run. Confirm "Success. No rows returned."

- [ ] **Step 1.3 — Seed participants from the old predefined list**

In the SQL editor, run:

```sql
insert into public.participants (name) values
  ('Adri'), ('Anita'), ('Annna'), ('Anto'), ('Edwin'),
  ('Maria'), ('Marie'), ('Martina'), ('Naomí'), ('Nika'), ('Pau');
```

Expected: "11 rows inserted."

- [ ] **Step 1.4 — Verify schema and RPC exist**

In the SQL editor, run each query and confirm the expected output:

```sql
-- Tables exist
select table_name from information_schema.tables
 where table_schema = 'public'
   and table_name in ('participants','polls','votes','score_events')
 order by table_name;
-- Expected: 4 rows
```

```sql
-- RPC exists
select proname from pg_proc where proname = 'score_poll';
-- Expected: 1 row (score_poll)
```

```sql
-- Realtime publication includes participants
select schemaname, tablename from pg_publication_tables
 where pubname = 'supabase_realtime' and tablename = 'participants';
-- Expected: 1 row
```

- [ ] **Step 1.5 — Smoke-test the RPC end-to-end**

Run in SQL editor. This simulates a complete poll, then asserts scoring.

```sql
-- Pick two participants for the smoke test
do $$
declare
  v_artist_id uuid;
  v_voter1_id uuid;
  v_voter2_id uuid;
begin
  select id into v_artist_id from public.participants where name = 'Pau';
  select id into v_voter1_id from public.participants where name = 'Adri';
  select id into v_voter2_id from public.participants where name = 'Edwin';

  -- Create a poll and reveal it
  insert into public.polls (id, correct_participant_id, status)
    values ('poll_smoke_test', v_artist_id, 'revealed');

  -- Both voters guess correctly → all_guessed branch
  insert into public.votes (poll_id, voter_participant_id, voted_for_id, timestamp)
    values
      ('poll_smoke_test', v_voter1_id, v_artist_id, extract(epoch from now())::bigint * 1000),
      ('poll_smoke_test', v_voter2_id, v_artist_id, extract(epoch from now())::bigint * 1000);
end $$;

select public.score_poll('poll_smoke_test');

-- Expected: each non-artist voter gained 1 point, artist gained 0
select name, points from public.participants where name in ('Pau','Adri','Edwin') order by name;
-- Expected: Adri = 1, Edwin = 1, Pau = 0 (assuming everyone started at 0)
```

- [ ] **Step 1.6 — Clean up smoke-test data**

```sql
delete from public.score_events where poll_id = 'poll_smoke_test';
delete from public.votes        where poll_id = 'poll_smoke_test';
delete from public.polls        where id     = 'poll_smoke_test';
update public.participants set points = 0;  -- reset for real use
```

- [ ] **Step 1.7 — Commit the migration file**

```bash
git add supabase/migrations/0001_init_artist_vote.sql
git commit -m "✨ feat: add participants, polls, votes, score_events schema and score_poll RPC"
```

---

## Task 2 — Rewrite `poll.types.ts`

**Files:**
- Modify (full rewrite): `src/types/poll.types.ts`

- [ ] **Step 2.1 — Replace the file contents**

Overwrite `src/types/poll.types.ts` with:

```ts
/**
 * Type definitions for the Artist Vote gamified polling system.
 */

export type Participant = {
  id: string;
  name: string;
  points: number;
};

export type Vote = {
  voterParticipantId: string;
  votedForId: string;
  timestamp: number;
};

export type PollStatus = "voting" | "revealed" | "scored";

export type PollState = {
  pollId: string;
  correctParticipantId: string;
  participants: Participant[];
  status: PollStatus;
};

export type ScoreEventReason =
  | "nobody_guessed"
  | "all_guessed"
  | "correct_guess"
  | "artist_per_wrong_vote";

export type ScoreEvent = {
  pollId: string;
  participantId: string;
  delta: number;
  reason: ScoreEventReason;
};

/**
 * Aggregated per-option result for the results screen.
 */
export type VoteResult = {
  participantId: string;
  participantName: string;
  voteCount: number;
  percentage: number;
};

export type VoteResults = {
  results: VoteResult[];
  totalVotes: number;
  correctGuessers: Participant[];
};

/**
 * Real-time broadcast message envelope.
 */
export type PollMessage =
  | { type: "VOTE_CAST";        payload: Vote;  timestamp: number }
  | { type: "REVEAL_RESULTS";   payload: null;  timestamp: number }
  | { type: "SHOW_LEADERBOARD"; payload: null;  timestamp: number };

/**
 * Identity stored in sessionStorage so a participant doesn't re-pick on every poll.
 */
export type StoredIdentity = {
  id: string;
  name: string;
};
```

- [ ] **Step 2.2 — Run typecheck**

```bash
cd /Users/pauguri/code/artist-vote && npx tsc --noEmit
```

Expected: many errors in files that still reference the old types (`PollOption`, `correctOptionId`, etc.). That's expected — those files get rewritten in later tasks. Note the count for reference.

- [ ] **Step 2.3 — Commit**

```bash
git add src/types/poll.types.ts
git commit -m "📦 refactor: rewrite poll types for identified voting and scoring"
```

---

## Task 3 — `src/lib/identity.ts`

**Files:**
- Create: `src/lib/identity.ts`

- [ ] **Step 3.1 — Write the module**

```ts
"use client";

import type { StoredIdentity } from "@/types/poll.types";

const STORAGE_KEY = "artistVote.identity";

/**
 * Reads the participant identity from sessionStorage.
 * Returns null on the server, when no identity is set, or when the stored
 * value is malformed.
 */
export function getIdentity(): StoredIdentity | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredIdentity;
    if (typeof parsed?.id === "string" && typeof parsed?.name === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function setIdentity(identity: StoredIdentity): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
}

export function clearIdentity(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(STORAGE_KEY);
}
```

- [ ] **Step 3.2 — Typecheck**

```bash
npx tsc --noEmit
```

Expected: the new file compiles. Existing errors from Task 2 remain.

- [ ] **Step 3.3 — Commit**

```bash
git add src/lib/identity.ts
git commit -m "✨ feat: add sessionStorage identity helpers"
```

---

## Task 4 — `src/lib/participants.ts`

**Files:**
- Create: `src/lib/participants.ts`

- [ ] **Step 4.1 — Write the module**

```ts
"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { Participant } from "@/types/poll.types";

type ParticipantRow = {
  id: string;
  name: string;
  points: number;
};

function rowToParticipant(row: ParticipantRow): Participant {
  return { id: row.id, name: row.name, points: row.points };
}

/**
 * Fetches all participants, ordered by name ascending.
 */
export async function listParticipants(): Promise<Participant[]> {
  const { data, error } = await supabase
    .from("participants")
    .select("id, name, points")
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Failed to load participants: ${error.message}`);
  }
  return (data as ParticipantRow[]).map(rowToParticipant);
}

export async function getParticipantById(id: string): Promise<Participant | null> {
  const { data, error } = await supabase
    .from("participants")
    .select("id, name, points")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load participant: ${error.message}`);
  }
  return data ? rowToParticipant(data as ParticipantRow) : null;
}

/**
 * Subscribes to UPDATE events on the participants table.
 * The callback fires with the updated row whenever any participant's points change.
 * Returns the channel so callers can unsubscribe on unmount.
 */
export function subscribeToParticipants(
  onUpdate: (participant: Participant) => void
): RealtimeChannel {
  const channel = supabase
    .channel("participants-cdc")
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "participants" },
      (payload) => {
        const row = payload.new as ParticipantRow;
        onUpdate(rowToParticipant(row));
      }
    )
    .subscribe();
  return channel;
}
```

- [ ] **Step 4.2 — Typecheck**

```bash
npx tsc --noEmit
```

Expected: the new file compiles.

- [ ] **Step 4.3 — Commit**

```bash
git add src/lib/participants.ts
git commit -m "✨ feat: add participants library and Postgres Changes subscription"
```

---

## Task 5 — `src/lib/polls.ts`

**Files:**
- Create: `src/lib/polls.ts`

- [ ] **Step 5.1 — Write the module**

```ts
"use client";

import { supabase } from "./supabase";
import type { PollStatus } from "@/types/poll.types";

type PollRow = {
  id: string;
  correct_participant_id: string;
  status: PollStatus;
  scored_at: string | null;
};

export type PollRecord = {
  id: string;
  correctParticipantId: string;
  status: PollStatus;
};

function rowToRecord(row: PollRow): PollRecord {
  return {
    id: row.id,
    correctParticipantId: row.correct_participant_id,
    status: row.status,
  };
}

export async function createPoll(args: {
  pollId: string;
  correctParticipantId: string;
}): Promise<void> {
  const { error } = await supabase.from("polls").insert({
    id: args.pollId,
    correct_participant_id: args.correctParticipantId,
    status: "voting",
  });
  if (error) {
    throw new Error(`Failed to create poll: ${error.message}`);
  }
}

export async function getPoll(pollId: string): Promise<PollRecord | null> {
  const { data, error } = await supabase
    .from("polls")
    .select("id, correct_participant_id, status, scored_at")
    .eq("id", pollId)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load poll: ${error.message}`);
  }
  return data ? rowToRecord(data as PollRow) : null;
}

/**
 * Flips the poll from 'voting' to 'revealed'. Idempotent in practice — repeating
 * this call after the status has moved on is a no-op (the WHERE filter matches
 * zero rows). We deliberately don't return rowcount; callers don't need it.
 */
export async function revealPoll(pollId: string): Promise<void> {
  const { error } = await supabase
    .from("polls")
    .update({ status: "revealed" })
    .eq("id", pollId)
    .eq("status", "voting");
  if (error) {
    throw new Error(`Failed to reveal poll: ${error.message}`);
  }
}
```

- [ ] **Step 5.2 — Typecheck and commit**

```bash
npx tsc --noEmit
```

Expected: new file compiles.

```bash
git add src/lib/polls.ts
git commit -m "✨ feat: add polls library (createPoll, getPoll, revealPoll)"
```

---

## Task 6 — `src/lib/votes.ts` (replaces `voteDatabase.ts`)

**Files:**
- Create: `src/lib/votes.ts`
- Delete: `src/lib/voteDatabase.ts` (later, in Step 6.4 — after the import in `useVoteChannel.ts` is migrated in Task 8; we keep the old file alive until then to avoid a broken intermediate commit)

- [ ] **Step 6.1 — Write the new module**

Create `src/lib/votes.ts`:

```ts
"use client";

import { supabase } from "./supabase";
import type { Vote } from "@/types/poll.types";

type VoteRow = {
  poll_id: string;
  voter_participant_id: string;
  voted_for_id: string;
  timestamp: number;
};

function rowToVote(row: VoteRow): Vote {
  return {
    voterParticipantId: row.voter_participant_id,
    votedForId: row.voted_for_id,
    timestamp: row.timestamp,
  };
}

/**
 * UPSERT a vote. "Last vote wins" because (poll_id, voter_participant_id) is the PK.
 */
export async function saveVote(pollId: string, vote: Vote): Promise<void> {
  const { error } = await supabase
    .from("votes")
    .upsert(
      {
        poll_id: pollId,
        voter_participant_id: vote.voterParticipantId,
        voted_for_id: vote.votedForId,
        timestamp: vote.timestamp,
      },
      { onConflict: "poll_id,voter_participant_id" }
    );
  if (error) {
    throw new Error(`Failed to save vote: ${error.message}`);
  }
}

export async function loadVotes(pollId: string): Promise<Vote[]> {
  const { data, error } = await supabase
    .from("votes")
    .select("poll_id, voter_participant_id, voted_for_id, timestamp")
    .eq("poll_id", pollId)
    .order("timestamp", { ascending: true });
  if (error) {
    throw new Error(`Failed to load votes: ${error.message}`);
  }
  return (data as VoteRow[]).map(rowToVote);
}
```

- [ ] **Step 6.2 — Typecheck**

```bash
npx tsc --noEmit
```

Expected: new file compiles. Old `voteDatabase.ts` still exists but is unreferenced after Task 8 — its own typecheck errors are gated by the rewrite of `useVoteChannel.ts`. If existing errors include `voteDatabase.ts` referencing the old `Vote` shape, that's fine — we'll fix it via deletion in Step 6.4.

- [ ] **Step 6.3 — Commit the new file**

```bash
git add src/lib/votes.ts
git commit -m "✨ feat: add votes library with identified vote UPSERT and loadVotes"
```

- [ ] **Step 6.4 — DEFER DELETION**

Do not delete `src/lib/voteDatabase.ts` yet. Task 8 swaps the import in `useVoteChannel.ts`; deletion happens in Task 8, Step 8.5.

---

## Task 7 — `src/lib/scoring.ts`

**Files:**
- Create: `src/lib/scoring.ts`

- [ ] **Step 7.1 — Write the module**

```ts
"use client";

import { supabase } from "./supabase";
import type { ScoreEvent, ScoreEventReason } from "@/types/poll.types";

type ScoreEventRow = {
  poll_id: string;
  participant_id: string;
  delta: number;
  reason: ScoreEventReason;
};

function rowToEvent(row: ScoreEventRow): ScoreEvent {
  return {
    pollId: row.poll_id,
    participantId: row.participant_id,
    delta: row.delta,
    reason: row.reason,
  };
}

/**
 * Invokes the server-side scoring function. Idempotent: a second call after
 * the poll has been scored is a no-op on the server side.
 */
export async function scorePoll(pollId: string): Promise<void> {
  const { error } = await supabase.rpc("score_poll", { p_poll_id: pollId });
  if (error) {
    throw new Error(`Failed to score poll: ${error.message}`);
  }
}

export async function loadScoreEvents(pollId: string): Promise<ScoreEvent[]> {
  const { data, error } = await supabase
    .from("score_events")
    .select("poll_id, participant_id, delta, reason")
    .eq("poll_id", pollId);
  if (error) {
    throw new Error(`Failed to load score events: ${error.message}`);
  }
  return (data as ScoreEventRow[]).map(rowToEvent);
}
```

- [ ] **Step 7.2 — Typecheck and commit**

```bash
npx tsc --noEmit
```

Expected: new file compiles.

```bash
git add src/lib/scoring.ts
git commit -m "✨ feat: add scorePoll RPC wrapper and loadScoreEvents"
```

---

## Task 8 — Update `useVoteChannel.ts` (extend message union; swap to `votes.ts`)

**Files:**
- Modify (full rewrite): `src/hooks/useVoteChannel.ts`
- Delete: `src/lib/voteDatabase.ts`

- [ ] **Step 8.1 — Replace the hook**

Overwrite `src/hooks/useVoteChannel.ts`:

```ts
"use client";

import { useEffect, useRef, useCallback } from "react";
import { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { saveVote } from "@/lib/votes";
import { Vote, PollMessage } from "@/types/poll.types";

type VoteCallback = (vote: Vote) => void;
type RevealCallback = () => void;
type ShowLeaderboardCallback = () => void;

interface UseVoteChannelReturn {
  sendVote: (vote: Vote) => Promise<void>;
  sendRevealCommand: () => Promise<void>;
  sendShowLeaderboard: () => Promise<void>;
  isConnected: boolean;
}

/**
 * Realtime channel hook for a single poll.
 * Sends and receives VOTE_CAST, REVEAL_RESULTS, and SHOW_LEADERBOARD broadcasts.
 */
export function useVoteChannel(
  pollId: string | null,
  onVoteReceived?: VoteCallback,
  onRevealResults?: RevealCallback,
  onShowLeaderboard?: ShowLeaderboardCallback
): UseVoteChannelReturn {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const isConnectedRef = useRef(false);

  useEffect(() => {
    if (!pollId) return;

    const channelName = `poll-votes-${pollId}`;
    const channel = supabase.channel(channelName);

    channel
      .on("broadcast", { event: "poll" }, (payload) => {
        try {
          const message = payload.payload as PollMessage;
          if (message.type === "VOTE_CAST" && onVoteReceived) {
            onVoteReceived(message.payload);
          } else if (message.type === "REVEAL_RESULTS" && onRevealResults) {
            onRevealResults();
          } else if (message.type === "SHOW_LEADERBOARD" && onShowLeaderboard) {
            onShowLeaderboard();
          }
        } catch (error) {
          console.error("Error processing message:", error);
        }
      })
      .subscribe((status) => {
        isConnectedRef.current = status === "SUBSCRIBED";
      });

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
      isConnectedRef.current = false;
    };
  }, [pollId, onVoteReceived, onRevealResults, onShowLeaderboard]);

  const sendVote = useCallback(
    async (vote: Vote): Promise<void> => {
      if (!channelRef.current || !pollId) {
        throw new Error("Channel not connected");
      }
      await saveVote(pollId, vote);
      const message: PollMessage = {
        type: "VOTE_CAST",
        payload: vote,
        timestamp: Date.now(),
      };
      await channelRef.current.send({ type: "broadcast", event: "poll", payload: message });
    },
    [pollId]
  );

  const sendRevealCommand = useCallback(async (): Promise<void> => {
    if (!channelRef.current) throw new Error("Channel not connected");
    const message: PollMessage = { type: "REVEAL_RESULTS", payload: null, timestamp: Date.now() };
    await channelRef.current.send({ type: "broadcast", event: "poll", payload: message });
  }, []);

  const sendShowLeaderboard = useCallback(async (): Promise<void> => {
    if (!channelRef.current) throw new Error("Channel not connected");
    const message: PollMessage = { type: "SHOW_LEADERBOARD", payload: null, timestamp: Date.now() };
    await channelRef.current.send({ type: "broadcast", event: "poll", payload: message });
  }, []);

  return {
    sendVote,
    sendRevealCommand,
    sendShowLeaderboard,
    isConnected: isConnectedRef.current,
  };
}
```

- [ ] **Step 8.2 — Typecheck**

```bash
npx tsc --noEmit
```

Expected: the hook itself compiles. Errors persist in `sidepanel`, `activitysidepanel`, `mainstage` pages and in `voteCalculations.ts`, `VoteResults.tsx`, `OptionList.tsx`, `VoteConfirmation.tsx` because they still reference the old types. Those are addressed in later tasks.

- [ ] **Step 8.3 — Delete legacy `voteDatabase.ts`**

```bash
git rm src/lib/voteDatabase.ts
```

- [ ] **Step 8.4 — Typecheck again**

```bash
npx tsc --noEmit
```

Expected: no new errors (no remaining importers of `voteDatabase.ts`). Existing errors persist as above.

- [ ] **Step 8.5 — Commit**

```bash
git add src/hooks/useVoteChannel.ts
git commit -m "📦 refactor: extend useVoteChannel with SHOW_LEADERBOARD and swap to votes lib"
```

---

## Task 9 — Trim `voteCalculations.ts`

**Files:**
- Modify (full rewrite): `src/utils/voteCalculations.ts`

- [ ] **Step 9.1 — Replace the file**

```ts
import type { Participant, Vote, VoteResult, VoteResults } from "../types/poll.types";

/**
 * Aggregates votes by the participant they voted for, sorted by count descending.
 * Also returns the list of participants who guessed the correct answer.
 */
export function calculateResults(
  votes: Vote[],
  participants: Participant[],
  correctParticipantId: string
): VoteResults {
  const totalVotes = votes.length;
  const participantsById = new Map(participants.map((p) => [p.id, p]));

  const counts = new Map<string, number>();
  for (const p of participants) counts.set(p.id, 0);
  for (const v of votes) {
    counts.set(v.votedForId, (counts.get(v.votedForId) ?? 0) + 1);
  }

  const results: VoteResult[] = Array.from(counts.entries())
    .map(([participantId, voteCount]) => {
      const p = participantsById.get(participantId);
      return {
        participantId,
        participantName: p?.name ?? "?",
        voteCount,
        percentage: totalVotes > 0 ? (voteCount / totalVotes) * 100 : 0,
      };
    })
    .sort((a, b) => b.voteCount - a.voteCount);

  const correctGuessers: Participant[] = votes
    .filter((v) => v.votedForId === correctParticipantId)
    .map((v) => participantsById.get(v.voterParticipantId))
    .filter((p): p is Participant => Boolean(p));

  return { results, totalVotes, correctGuessers };
}

/**
 * Generates a unique poll ID with the legacy prefix scheme.
 */
export function generatePollId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `poll_${timestamp}_${random}`;
}
```

- [ ] **Step 9.2 — Typecheck and commit**

```bash
npx tsc --noEmit
```

Expected: `voteCalculations.ts` compiles. Errors remain in pages and components that reference removed helpers (`generateVoterId`, `parseCustomOptions`, etc.) — those files are rewritten in later tasks.

```bash
git add src/utils/voteCalculations.ts
git commit -m "📦 refactor: trim voteCalculations to generatePollId + identified calculateResults"
```

---

## Task 10 — `IdentityHeader` component

**Files:**
- Create: `src/components/IdentityHeader.tsx`

- [ ] **Step 10.1 — Write the component**

```tsx
"use client";

import { useEffect, useState } from "react";
import { subscribeToParticipants } from "@/lib/participants";

type IdentityHeaderProps = {
  participantId: string;
  name: string;
  initialPoints: number;
  onChange: () => void;
};

export default function IdentityHeader({
  participantId,
  name,
  initialPoints,
  onChange,
}: IdentityHeaderProps) {
  const [points, setPoints] = useState(initialPoints);

  useEffect(() => {
    const channel = subscribeToParticipants((p) => {
      if (p.id === participantId) {
        setPoints(p.points);
      }
    });
    return () => {
      channel.unsubscribe();
    };
  }, [participantId]);

  return (
    <div className="flex items-center justify-between mb-6 px-4 py-3 hand-drawn-subtle border-3 border-crayon-purple/40 bg-card">
      <div className="flex items-center gap-2 font-body">
        <span className="text-xl">👤</span>
        <span className="font-heading text-base font-bold text-text-primary">{name}</span>
        <span className="text-xl ml-2">🏆</span>
        <span className="font-heading text-base font-bold text-crayon-purple">{points} punts</span>
      </div>
      <button
        type="button"
        onClick={onChange}
        className="font-body text-sm text-crayon-blue underline hover:text-crayon-purple"
        aria-label="Canviar d'identitat"
      >
        Canviar
      </button>
    </div>
  );
}
```

- [ ] **Step 10.2 — Typecheck and commit**

```bash
npx tsc --noEmit
```

```bash
git add src/components/IdentityHeader.tsx
git commit -m "✨ feat: add IdentityHeader with live points via Postgres Changes"
```

---

## Task 11 — `IdentityPicker` component

**Files:**
- Create: `src/components/IdentityPicker.tsx`

- [ ] **Step 11.1 — Write the component**

```tsx
"use client";

import type { Participant } from "@/types/poll.types";

type IdentityPickerProps = {
  participants: Participant[];
  onPick: (p: Participant) => void;
};

const crayonColors = [
  "border-crayon-blue",
  "border-crayon-pink",
  "border-crayon-green",
  "border-crayon-purple",
  "border-crayon-orange",
  "border-crayon-yellow",
  "border-crayon-red",
];

export default function IdentityPicker({ participants, onPick }: IdentityPickerProps) {
  return (
    <div className="max-w-md mx-auto w-full">
      <div className="text-center mb-6">
        <div className="flex justify-center gap-2 mb-3">
          <span className="text-3xl">👋</span>
          <span className="text-3xl">🎨</span>
        </div>
        <h1 className="font-heading text-3xl font-bold text-crayon-purple mb-2">Qui ets?</h1>
        <p className="font-body text-base text-text-secondary">
          Selecciona el teu nom per començar a votar
        </p>
      </div>

      <div className="space-y-3">
        {participants.map((p, index) => {
          const color = crayonColors[index % crayonColors.length];
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onPick(p)}
              className={`w-full flex items-center justify-between p-4 hand-drawn-subtle border-3 ${color} bg-card transition-all hover:scale-[1.01] hover:shadow-md`}
            >
              <span className="font-heading text-lg font-bold text-text-primary">{p.name}</span>
              <span className="font-body text-sm text-text-secondary">🏆 {p.points}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 11.2 — Typecheck and commit**

```bash
npx tsc --noEmit
```

```bash
git add src/components/IdentityPicker.tsx
git commit -m "✨ feat: add IdentityPicker first-time selector"
```

---

## Task 12 — `ArtistWaitingView` component

**Files:**
- Create: `src/components/ArtistWaitingView.tsx`

- [ ] **Step 12.1 — Write the component**

```tsx
"use client";

type ArtistWaitingViewProps = {
  name: string;
  hasRevealed: boolean;
};

export default function ArtistWaitingView({ name, hasRevealed }: ArtistWaitingViewProps) {
  return (
    <div className="text-center py-8">
      <div className="flex justify-center gap-2 mb-4">
        <span className="text-5xl animate-bounce" style={{ animationDelay: "0ms" }}>🎨</span>
        <span className="text-5xl animate-bounce" style={{ animationDelay: "100ms" }}>✨</span>
        <span className="text-5xl animate-bounce" style={{ animationDelay: "200ms" }}>🌟</span>
      </div>
      <h1 className="font-heading text-3xl font-bold text-crayon-purple mb-3">
        Avui l&apos;artista ets tu, {name}!
      </h1>
      <p className="font-body text-base text-text-secondary mb-2">
        No has de votar en aquesta ronda.
      </p>
      <p className="font-body text-base text-text-secondary">
        {hasRevealed
          ? "Els resultats s'estan mostrant a la pantalla principal."
          : "Espera mentre la resta vota."}
      </p>
    </div>
  );
}
```

- [ ] **Step 12.2 — Typecheck and commit**

```bash
npx tsc --noEmit
```

```bash
git add src/components/ArtistWaitingView.tsx
git commit -m "✨ feat: add ArtistWaitingView for the correct participant"
```

---

## Task 13 — `VotingProgress` component

**Files:**
- Create: `src/components/VotingProgress.tsx`

- [ ] **Step 13.1 — Write the component**

```tsx
"use client";

type VotingProgressProps = {
  voteCount: number;
};

export default function VotingProgress({ voteCount }: VotingProgressProps) {
  return (
    <div className="max-w-4xl mx-auto text-center py-12">
      <div className="mb-8">
        <h1 className="font-heading text-5xl md:text-6xl font-bold text-crayon-purple mb-6">
          Qui és l&apos;artista d&apos;avui?
        </h1>

        <div className="mt-8 mb-6">
          <div className="inline-flex items-center justify-center w-40 h-40 hand-drawn border-4 border-crayon-blue bg-crayon-blue/10 shadow-playful">
            <span className="font-heading text-6xl font-bold text-crayon-blue">{voteCount}</span>
          </div>
        </div>

        <p className="font-heading text-3xl font-bold text-text-primary">
          {voteCount === 1 ? "vot rebut" : "vots rebuts"}
        </p>

        <p className="font-body text-xl text-text-secondary mt-4">Esperant els resultats...</p>
      </div>

      <div className="mt-8 flex justify-center gap-3">
        <span className="text-4xl animate-pulse">👀</span>
      </div>

      <div className="mt-6 flex justify-center">
        <div className="flex space-x-3">
          <div className="h-4 w-4 bg-crayon-pink rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
          <div className="h-4 w-4 bg-crayon-blue rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
          <div className="h-4 w-4 bg-crayon-yellow rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
          <div className="h-4 w-4 bg-crayon-green rounded-full animate-bounce" style={{ animationDelay: "450ms" }}></div>
          <div className="h-4 w-4 bg-crayon-purple rounded-full animate-bounce" style={{ animationDelay: "600ms" }}></div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 13.2 — Typecheck and commit**

```bash
npx tsc --noEmit
```

```bash
git add src/components/VotingProgress.tsx
git commit -m "✨ feat: extract VotingProgress live-counter into its own component"
```

---

## Task 14 — `ResultsView` component (renamed from `VoteResults`)

**Files:**
- Create: `src/components/ResultsView.tsx`
- Delete: `src/components/VoteResults.tsx`

- [ ] **Step 14.1 — Create the new file**

```tsx
"use client";

import type { Participant, VoteResults as VoteResultsType } from "@/types/poll.types";

type ResultsViewProps = {
  results: VoteResultsType;
  artist: Participant;
};

const crayonColors = [
  { bg: "bg-crayon-blue",   border: "border-crayon-blue",   text: "text-crayon-blue" },
  { bg: "bg-crayon-pink",   border: "border-crayon-pink",   text: "text-crayon-pink" },
  { bg: "bg-crayon-green",  border: "border-crayon-green",  text: "text-crayon-green" },
  { bg: "bg-crayon-purple", border: "border-crayon-purple", text: "text-crayon-purple" },
  { bg: "bg-crayon-orange", border: "border-crayon-orange", text: "text-crayon-orange" },
  { bg: "bg-crayon-red",    border: "border-crayon-red",    text: "text-crayon-red" },
];

export default function ResultsView({ results, artist }: ResultsViewProps) {
  const { results: optionResults, totalVotes, correctGuessers } = results;
  const artistResult = optionResults.find((r) => r.participantId === artist.id);
  const otherResults = optionResults.filter((r) => r.participantId !== artist.id);

  if (totalVotes === 0) {
    return (
      <div className="text-center py-12">
        <h2 className="font-heading text-3xl font-bold text-text-secondary mb-3">Ningú no ha votat</h2>
        <p className="font-body text-lg text-text-secondary">
          L&apos;artista d&apos;avui era <strong>{artist.name}</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="text-center mb-8">
        <h1 className="font-heading text-4xl md:text-5xl font-bold text-crayon-purple mb-3">
          Resultats de la Votació
        </h1>
        <p className="font-body text-xl text-text-secondary">
          {totalVotes} {totalVotes === 1 ? "vot rebut" : "vots rebuts"}
        </p>
      </div>

      {/* Artist hero card */}
      <div className="bg-crayon-yellow/20 border-4 border-crayon-yellow hand-drawn p-8 mb-6 text-center shadow-playful-yellow">
        <div className="mb-4 flex justify-center gap-2">
          <span className="text-4xl animate-bounce" style={{ animationDelay: "0ms" }}>🌟</span>
          <span className="text-5xl animate-bounce" style={{ animationDelay: "100ms" }}>🎨</span>
          <span className="text-4xl animate-bounce" style={{ animationDelay: "200ms" }}>🌟</span>
        </div>
        <h2 className="font-heading text-3xl md:text-4xl font-bold text-crayon-yellow mb-2"
            style={{ textShadow: "2px 2px 0 rgba(0,0,0,0.1)" }}>
          L&apos;artista d&apos;avui és:
        </h2>
        <p className="font-heading text-4xl md:text-5xl font-bold text-crayon-purple mb-3">
          {artist.name}
        </p>
        {artistResult && (
          <p className="font-body text-lg text-text-primary">
            {artistResult.voteCount} {artistResult.voteCount === 1 ? "vot" : "vots"} ({artistResult.percentage.toFixed(1)}%)
          </p>
        )}
      </div>

      {/* Correct guessers highlight */}
      <div className="bg-crayon-green/15 border-3 border-crayon-green hand-drawn-subtle p-5 mb-8 text-center">
        <p className="font-heading text-lg font-bold text-crayon-green mb-2">
          {correctGuessers.length === 0
            ? "Ningú ho ha encertat 🙈"
            : "Qui ho ha encertat:"}
        </p>
        {correctGuessers.length > 0 && (
          <p className="font-body text-xl text-text-primary">
            {correctGuessers.map((g) => g.name).join(", ")}
          </p>
        )}
      </div>

      {/* Other (wrong-answer) aggregate breakdown */}
      {otherResults.length > 0 && (
        <div className="space-y-4">
          {otherResults.map((result, index) => {
            const color = crayonColors[index % crayonColors.length];
            return (
              <div key={result.participantId} className={`p-5 hand-drawn-subtle border-3 bg-card ${color.border}`}>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-heading text-xl font-bold text-text-primary">
                    {result.participantName}
                  </span>
                  <div className="text-right">
                    <div className={`font-heading text-3xl font-bold ${color.text}`}>
                      {result.voteCount}
                    </div>
                    <div className="font-body text-sm text-text-secondary">
                      {result.percentage.toFixed(1)}%
                    </div>
                  </div>
                </div>
                <div className="w-full bg-text-secondary/20 rounded-full h-4 overflow-hidden hand-drawn-subtle">
                  <div
                    className={`h-full transition-all duration-700 ${color.bg}`}
                    style={{ width: `${result.percentage}%` }}
                    aria-label={`${result.percentage.toFixed(1)}% dels vots`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 14.2 — Delete the old file**

```bash
git rm src/components/VoteResults.tsx
```

- [ ] **Step 14.3 — Typecheck and commit**

```bash
npx tsc --noEmit
```

Expected: `ResultsView.tsx` compiles. Errors remain in `mainstage/page.tsx` which still imports `VoteResults` — fixed in Task 19.

```bash
git add src/components/ResultsView.tsx
git commit -m "📦 refactor: rename VoteResults to ResultsView and add correct-guessers highlight"
```

---

## Task 15 — `LeaderboardView` component

**Files:**
- Create: `src/components/LeaderboardView.tsx`

- [ ] **Step 15.1 — Write the component**

```tsx
"use client";

import { useEffect, useRef } from "react";
import type { Participant } from "@/types/poll.types";

type LeaderboardViewProps = {
  participants: Participant[];
  deltasByParticipantId: Record<string, number>;
};

const rowColors = [
  "border-crayon-yellow",
  "border-crayon-blue",
  "border-crayon-pink",
  "border-crayon-green",
  "border-crayon-purple",
  "border-crayon-orange",
  "border-crayon-red",
];

export default function LeaderboardView({
  participants,
  deltasByParticipantId,
}: LeaderboardViewProps) {
  const sorted = [...participants].sort((a, b) => b.points - a.points);
  const badgeRefs = useRef<Record<string, HTMLSpanElement | null>>({});

  // Animate +N badges into view on mount.
  useEffect(() => {
    Object.values(badgeRefs.current).forEach((el) => {
      if (!el) return;
      el.animate(
        [
          { transform: "translateY(-10px) scale(0.7)", opacity: 0 },
          { transform: "translateY(0) scale(1)", opacity: 1 },
        ],
        { duration: 600, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)", fill: "forwards" }
      );
    });
  }, []);

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="text-center mb-8">
        <div className="flex justify-center gap-2 mb-3">
          <span className="text-5xl">🏆</span>
        </div>
        <h1 className="font-heading text-4xl md:text-5xl font-bold text-crayon-purple">
          Puntuació
        </h1>
      </div>

      <ol className="space-y-3">
        {sorted.map((p, index) => {
          const delta = deltasByParticipantId[p.id] ?? 0;
          const color = rowColors[index % rowColors.length];
          return (
            <li
              key={p.id}
              className={`flex items-center justify-between p-4 hand-drawn-subtle border-3 ${color} bg-card`}
            >
              <div className="flex items-center gap-4">
                <span className="font-heading text-2xl font-bold text-text-secondary w-8">
                  {index + 1}
                </span>
                <span className="font-heading text-xl font-bold text-text-primary">
                  {p.name}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {delta > 0 && (
                  <span
                    ref={(el) => {
                      badgeRefs.current[p.id] = el;
                    }}
                    className="inline-block font-heading text-base font-bold text-white bg-crayon-green px-3 py-1 hand-drawn-subtle"
                  >
                    +{delta}
                  </span>
                )}
                <span className="font-heading text-2xl font-bold text-crayon-purple">
                  {p.points}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
```

- [ ] **Step 15.2 — Typecheck and commit**

```bash
npx tsc --noEmit
```

```bash
git add src/components/LeaderboardView.tsx
git commit -m "✨ feat: add LeaderboardView with animated +N delta badges"
```

---

## Task 16 — Delete obsolete files

**Files:**
- Delete: `src/data/predefinedOptions.json`
- Delete: `src/components/VoteConfirmation.tsx`

The activity panel will inline its post-vote confirmation in Task 18; the predefined-options JSON is no longer referenced anywhere after Task 17.

- [ ] **Step 16.1 — Verify nothing imports the targets**

```bash
grep -rn "predefinedOptions" src/ || echo "no refs"
grep -rn "VoteConfirmation" src/ || echo "no refs"
```

Expected: matches in `sidepanel/page.tsx` and `activitysidepanel/page.tsx` — that's fine, those pages are about to be rewritten in Tasks 17 and 18 and will not re-import these.

- [ ] **Step 16.2 — Delete the files**

```bash
git rm src/data/predefinedOptions.json
git rm src/components/VoteConfirmation.tsx
```

Note: this leaves `sidepanel/page.tsx` and `activitysidepanel/page.tsx` temporarily broken at the import line. That's acceptable; the next two tasks rewrite both. Do not run `npx tsc --noEmit` between this commit and Task 18 — it will fail by design.

- [ ] **Step 16.3 — Commit**

```bash
git commit -m "🗑 chore: remove predefinedOptions.json and VoteConfirmation component"
```

---

## Task 17 — Rewrite `sidepanel/page.tsx`

**Files:**
- Modify (full rewrite): `src/app/sidepanel/page.tsx`

- [ ] **Step 17.1 — Replace the file**

```tsx
"use client";

import { useEffect, useState } from "react";
import { meet, MeetSidePanelClient } from "@googleworkspace/meet-addons/meet.addons";
import { ACTIVITY_SIDE_PANEL_URL, CLOUD_PROJECT_NUMBER, MAIN_STAGE_URL } from "@/shared/constants";
import { generatePollId } from "@/utils/voteCalculations";
import { listParticipants } from "@/lib/participants";
import { createPoll } from "@/lib/polls";
import type { Participant, PollState } from "@/types/poll.types";

export default function Page() {
  const [sidePanelClient, setSidePanelClient] = useState<MeetSidePanelClient>();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [correctParticipantId, setCorrectParticipantId] = useState<string>("");
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    async function initialize() {
      const session = await meet.addon.createAddonSession({
        cloudProjectNumber: CLOUD_PROJECT_NUMBER,
      });
      const client = await session.createSidePanelClient();
      setSidePanelClient(client);

      try {
        const list = await listParticipants();
        setParticipants(list);
      } catch (err) {
        console.error("Error loading participants:", err);
        setError("No s'han pogut carregar els participants. Comprova la connexió.");
      }
    }
    initialize();
  }, []);

  async function startVoting() {
    if (!sidePanelClient) return;
    if (!correctParticipantId) {
      setError("Si us plau, selecciona qui és l'artista d'avui");
      return;
    }

    setIsStarting(true);
    setError("");

    try {
      const pollId = generatePollId();
      await createPoll({ pollId, correctParticipantId });

      const state: PollState = {
        pollId,
        correctParticipantId,
        participants,
        status: "voting",
      };

      await sidePanelClient.startActivity({
        mainStageUrl: MAIN_STAGE_URL,
        sidePanelUrl: ACTIVITY_SIDE_PANEL_URL,
        additionalData: JSON.stringify(state),
      });

      sessionStorage.setItem("hostOfPollId", pollId);
      window.location.replace(ACTIVITY_SIDE_PANEL_URL + window.location.search);
    } catch (err) {
      console.error("Error starting voting activity:", err);
      setError("Error iniciant la votació. Torna-ho a provar.");
      setIsStarting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col p-6 bg-paper">
      <div className="max-w-md mx-auto w-full">
        <div className="text-center mb-6">
          <div className="mb-3 flex justify-center gap-2">
            <span className="text-3xl">🎨</span>
            <span className="text-3xl">✨</span>
          </div>
          <h1 className="font-heading text-3xl font-bold text-crayon-purple mb-2">Qui és l&apos;artista?</h1>
          <p className="font-body text-base text-text-secondary">Selecciona l&apos;artista d&apos;avui</p>
        </div>

        {participants.length === 0 && !error && (
          <p className="text-center font-body text-text-secondary">Carregant participants...</p>
        )}

        {participants.length > 0 && (
          <div className="mb-6">
            <label className="block font-heading text-lg font-bold text-text-primary mb-3" htmlFor="artist-select">
              Qui és l&apos;artista d&apos;avui?
            </label>
            <select
              id="artist-select"
              value={correctParticipantId}
              onChange={(e) => {
                setCorrectParticipantId(e.target.value);
                setError("");
              }}
              className="w-full px-3 py-2 border-3 border-crayon-purple/50 hand-drawn-subtle bg-card text-text-primary font-body focus:outline-none focus:border-crayon-purple focus:ring-2 focus:ring-crayon-purple/20"
            >
              <option value="" disabled>Selecciona l&apos;artista...</option>
              {participants.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}

        {error && (
          <div className="mb-4 p-4 bg-crayon-red/10 border-3 border-crayon-red hand-drawn-subtle">
            <p className="font-body text-base text-crayon-red font-semibold">{error}</p>
          </div>
        )}

        <button
          type="button"
          onClick={startVoting}
          disabled={!sidePanelClient || isStarting || participants.length === 0}
          aria-label="Començar la votació"
          className={`w-full py-4 px-6 hand-drawn border-3 font-heading text-xl font-bold text-white transition-all duration-200 flex items-center justify-center gap-3 ${
            !sidePanelClient || isStarting || participants.length === 0
              ? "bg-text-secondary/40 border-text-secondary/40 cursor-not-allowed"
              : "bg-crayon-green border-crayon-green shadow-playful-green hover:scale-[1.02] hover:rotate-1 active:scale-[0.98] active:rotate-0"
          }`}
        >
          {isStarting ? (
            <>
              <span className="inline-block animate-spin rounded-full h-6 w-6 border-3 border-white/30 border-t-white" />
              <span>Iniciant votació...</span>
            </>
          ) : (
            <>
              <span className="text-2xl">🎨</span>
              <span>Començar votació</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 17.2 — Typecheck**

```bash
npx tsc --noEmit
```

Expected: `sidepanel/page.tsx` compiles. Errors remain in `activitysidepanel/page.tsx` and `mainstage/page.tsx` (Tasks 18 & 19).

- [ ] **Step 17.3 — Commit**

```bash
git add src/app/sidepanel/page.tsx
git commit -m "✨ feat: rewrite setup side panel to use participants table"
```

---

## Task 18 — Rewrite `activitysidepanel/page.tsx`

**Files:**
- Modify (full rewrite): `src/app/activitysidepanel/page.tsx`

- [ ] **Step 18.1 — Replace the file**

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { meet, MeetSidePanelClient } from "@googleworkspace/meet-addons/meet.addons";
import { CLOUD_PROJECT_NUMBER } from "@/shared/constants";
import type { Participant, PollState, Vote, StoredIdentity } from "@/types/poll.types";
import { useVoteChannel } from "@/hooks/useVoteChannel";
import { getIdentity, setIdentity as storeIdentity, clearIdentity } from "@/lib/identity";
import { scorePoll } from "@/lib/scoring";
import { revealPoll } from "@/lib/polls";
import IdentityHeader from "@/components/IdentityHeader";
import IdentityPicker from "@/components/IdentityPicker";
import ArtistWaitingView from "@/components/ArtistWaitingView";
import PollQuestion from "@/components/PollQuestion";
import OptionList from "@/components/OptionList";
import VoteButton from "@/components/VoteButton";

export default function Page() {
  const [, setSidePanelClient] = useState<MeetSidePanelClient>();
  const [pollState, setPollState] = useState<PollState | null>(null);
  const [identity, setIdentityState] = useState<StoredIdentity | null>(null);

  // Voting state
  const [selectedOptionId, setSelectedOptionId] = useState("");
  const [hasVoted, setHasVoted] = useState(false);
  const [votedForName, setVotedForName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reveal state
  const [hasRevealed, setHasRevealed] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);
  const [isShowingLeaderboard, setIsShowingLeaderboard] = useState(false);
  const [hasShownLeaderboard, setHasShownLeaderboard] = useState(false);

  const [isHost, setIsHost] = useState(false);

  const handleVoteReceived = useCallback((_vote: Vote) => {
    // Activity panel doesn't need to display vote counts to non-host participants.
    // Kept as a no-op so the channel is fully wired (mainstage cares about this).
  }, []);

  const handleRevealResults = useCallback(() => {
    setHasRevealed(true);
  }, []);

  const handleShowLeaderboard = useCallback(() => {
    setHasShownLeaderboard(true);
  }, []);

  const { sendVote, sendRevealCommand, sendShowLeaderboard } = useVoteChannel(
    pollState?.pollId ?? null,
    handleVoteReceived,
    handleRevealResults,
    handleShowLeaderboard
  );

  useEffect(() => {
    async function initialize() {
      const session = await meet.addon.createAddonSession({
        cloudProjectNumber: CLOUD_PROJECT_NUMBER,
      });
      const client = await session.createSidePanelClient();
      setSidePanelClient(client);

      const startingState = await client.getActivityStartingState();
      if (startingState.additionalData) {
        try {
          const state = JSON.parse(startingState.additionalData) as PollState;
          setPollState(state);
          setIsHost(sessionStorage.getItem("hostOfPollId") === state.pollId);
        } catch (err) {
          console.error("Error parsing poll state:", err);
        }
      }

      setIdentityState(getIdentity());
    }
    initialize();
  }, []);

  function onIdentityPicked(p: Participant) {
    const id: StoredIdentity = { id: p.id, name: p.name };
    storeIdentity(id);
    setIdentityState(id);
  }

  function onChangeIdentity() {
    clearIdentity();
    setIdentityState(null);
    setSelectedOptionId("");
    setHasVoted(false);
  }

  async function handleVoteSubmit() {
    if (!selectedOptionId || !pollState || !identity) return;
    setIsSubmitting(true);
    try {
      const vote: Vote = {
        voterParticipantId: identity.id,
        votedForId: selectedOptionId,
        timestamp: Date.now(),
      };
      const target = pollState.participants.find((p) => p.id === selectedOptionId);
      setVotedForName(target?.name ?? "Desconegut");
      await sendVote(vote);
      setHasVoted(true);
    } catch (err) {
      console.error("Error submitting vote:", err);
      alert("Error enviant el vot. Torna-ho a provar.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRevealClick() {
    if (hasRevealed || isRevealing || !pollState) return;
    setIsRevealing(true);
    try {
      await revealPoll(pollState.pollId);
      await sendRevealCommand();
      setHasRevealed(true);
    } catch (err) {
      console.error("Error revealing results:", err);
      alert("Error revelant els resultats. Torna-ho a provar.");
    } finally {
      setIsRevealing(false);
    }
  }

  async function handleShowLeaderboardClick() {
    if (!pollState || isShowingLeaderboard || hasShownLeaderboard) return;
    setIsShowingLeaderboard(true);
    try {
      await scorePoll(pollState.pollId);
      await sendShowLeaderboard();
      setHasShownLeaderboard(true);
    } catch (err) {
      console.error("Error showing leaderboard:", err);
      alert("Error mostrant la puntuació. Torna-ho a provar.");
    } finally {
      setIsShowingLeaderboard(false);
    }
  }

  if (!pollState) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-paper">
        <p className="font-heading text-xl text-text-secondary font-bold">Carregant...</p>
      </div>
    );
  }

  // Identity not yet chosen → show picker
  if (!identity) {
    return (
      <div className="min-h-screen flex flex-col p-6 bg-paper">
        <IdentityPicker participants={pollState.participants} onPick={onIdentityPicked} />
      </div>
    );
  }

  const isArtist = identity.id === pollState.correctParticipantId;
  const headerInitialPoints =
    pollState.participants.find((p) => p.id === identity.id)?.points ?? 0;

  return (
    <div className="min-h-screen flex flex-col p-6 bg-paper">
      <div className="max-w-md mx-auto w-full">
        <IdentityHeader
          participantId={identity.id}
          name={identity.name}
          initialPoints={headerInitialPoints}
          onChange={onChangeIdentity}
        />

        {isArtist ? (
          <ArtistWaitingView name={identity.name} hasRevealed={hasRevealed} />
        ) : (
          <>
            <PollQuestion />

            {hasVoted ? (
              <div>
                <div className="p-5 bg-crayon-green/10 border-3 border-crayon-green hand-drawn text-center mb-6">
                  <div className="flex justify-center gap-2 mb-2">
                    <span className="text-3xl">✅</span>
                  </div>
                  <p className="font-heading text-lg text-crayon-green font-bold">
                    Has votat per {votedForName}
                  </p>
                </div>

                {isHost && !hasRevealed && (
                  <button
                    type="button"
                    onClick={handleRevealClick}
                    disabled={isRevealing}
                    className={`w-full py-4 px-6 hand-drawn border-3 font-heading text-xl font-bold text-white transition-all duration-200 flex items-center justify-center gap-3 ${
                      isRevealing
                        ? "bg-text-secondary/40 border-text-secondary/40 cursor-not-allowed"
                        : "bg-crayon-purple border-crayon-purple shadow-playful-purple hover:scale-[1.02] hover:rotate-1 active:scale-[0.98] active:rotate-0"
                    }`}
                  >
                    {isRevealing ? "Revelant..." : (<><span className="text-2xl">🏅</span>Revelar resultats</>)}
                  </button>
                )}

                {isHost && hasRevealed && !hasShownLeaderboard && (
                  <button
                    type="button"
                    onClick={handleShowLeaderboardClick}
                    disabled={isShowingLeaderboard}
                    className={`w-full mt-4 py-4 px-6 hand-drawn border-3 font-heading text-xl font-bold text-white transition-all duration-200 flex items-center justify-center gap-3 ${
                      isShowingLeaderboard
                        ? "bg-text-secondary/40 border-text-secondary/40 cursor-not-allowed"
                        : "bg-crayon-orange border-crayon-orange shadow-playful-orange hover:scale-[1.02] hover:rotate-1 active:scale-[0.98] active:rotate-0"
                    }`}
                  >
                    {isShowingLeaderboard ? "Calculant..." : (<><span className="text-2xl">🏆</span>Mostrar puntuació</>)}
                  </button>
                )}

                {hasRevealed && (
                  <div className="mt-6 p-5 bg-crayon-purple/10 border-3 border-crayon-purple hand-drawn text-center">
                    <p className="font-heading text-lg text-crayon-purple font-bold">
                      Els resultats es mostren a la pantalla principal
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div className="mb-6">
                  <OptionList
                    options={pollState.participants.map((p) => ({ id: p.id, name: p.name }))}
                    selectedOptionId={selectedOptionId}
                    onSelect={setSelectedOptionId}
                    disabled={isSubmitting || hasRevealed}
                  />
                </div>
                <VoteButton
                  onClick={handleVoteSubmit}
                  disabled={!selectedOptionId || isSubmitting || hasRevealed}
                  loading={isSubmitting}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 18.2 — Update `OptionList.tsx` prop shape (compatibility)**

`OptionList` expects `PollOption[]`. With types rewritten, `PollOption` no longer exists; the activity panel maps participants to a `{id, name}` shape. Update the component's prop type so this compiles.

Edit `src/components/OptionList.tsx` (top of file):

Replace:
```ts
import type { PollOption } from '../types/poll.types';
```

With:
```ts
type Option = { id: string; name: string };
```

And replace `options: PollOption[]` in the `OptionListProps` with `options: Option[]`. Leave the rest of the file unchanged.

- [ ] **Step 18.3 — Update `PollQuestion.tsx` to drop the `round` prop**

Replace `src/components/PollQuestion.tsx` with:

```tsx
type PollQuestionProps = {
  subtitle?: string;
};

export default function PollQuestion({ subtitle }: PollQuestionProps) {
  return (
    <div className="poll-question mb-8 text-center">
      <h1 className="font-heading text-3xl md:text-4xl font-bold text-crayon-purple mb-3 underline-crayon">
        Qui és l&apos;artista d&apos;avui?
      </h1>
      {subtitle && (
        <p className="font-body text-base md:text-lg text-text-secondary">{subtitle}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 18.4 — Typecheck**

```bash
npx tsc --noEmit
```

Expected: `activitysidepanel/page.tsx`, `OptionList.tsx`, `PollQuestion.tsx` all compile. Errors remain only in `mainstage/page.tsx` (Task 19).

- [ ] **Step 18.5 — Commit**

```bash
git add src/app/activitysidepanel/page.tsx src/components/OptionList.tsx src/components/PollQuestion.tsx
git commit -m "✨ feat: rewrite activity side panel with identity flow and two-stage reveal"
```

---

## Task 19 — Rewrite `mainstage/page.tsx`

**Files:**
- Modify (full rewrite): `src/app/mainstage/page.tsx`

- [ ] **Step 19.1 — Replace the file**

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { meet, MeetMainStageClient } from "@googleworkspace/meet-addons/meet.addons";
import { CLOUD_PROJECT_NUMBER } from "@/shared/constants";
import type { Participant, PollState, Vote, ScoreEvent } from "@/types/poll.types";
import { calculateResults } from "@/utils/voteCalculations";
import { loadVotes } from "@/lib/votes";
import { listParticipants, subscribeToParticipants } from "@/lib/participants";
import { getPoll } from "@/lib/polls";
import { loadScoreEvents } from "@/lib/scoring";
import { useVoteChannel } from "@/hooks/useVoteChannel";
import VotingProgress from "@/components/VotingProgress";
import ResultsView from "@/components/ResultsView";
import LeaderboardView from "@/components/LeaderboardView";

type View = "voting" | "results" | "leaderboard";

export default function Page() {
  const [pollState, setPollState] = useState<PollState | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [view, setView] = useState<View>("voting");
  const [scoreEvents, setScoreEvents] = useState<ScoreEvent[]>([]);

  const handleVoteReceived = useCallback((vote: Vote) => {
    setVotes((prev) => {
      const filtered = prev.filter((v) => v.voterParticipantId !== vote.voterParticipantId);
      return [...filtered, vote];
    });
  }, []);

  const handleRevealResults = useCallback(() => {
    setView((v) => (v === "voting" ? "results" : v));
  }, []);

  const handleShowLeaderboard = useCallback(async () => {
    if (!pollState) return;
    try {
      const [events, freshParticipants] = await Promise.all([
        loadScoreEvents(pollState.pollId),
        listParticipants(),
      ]);
      setScoreEvents(events);
      setParticipants(freshParticipants);
      setView("leaderboard");
    } catch (err) {
      console.error("Error transitioning to leaderboard:", err);
    }
  }, [pollState]);

  useVoteChannel(
    pollState?.pollId ?? null,
    handleVoteReceived,
    handleRevealResults,
    handleShowLeaderboard
  );

  // Live updates to participants.points so the leaderboard reflects scoring.
  useEffect(() => {
    const channel = subscribeToParticipants((updated) => {
      setParticipants((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    });
    return () => {
      channel.unsubscribe();
    };
  }, []);

  // Cold-start: parse starting state, then sync with DB for late joiners.
  useEffect(() => {
    async function initialize() {
      const session = await meet.addon.createAddonSession({
        cloudProjectNumber: CLOUD_PROJECT_NUMBER,
      });
      const client: MeetMainStageClient = await session.createMainStageClient();
      const starting = await client.getActivityStartingState();
      if (!starting.additionalData) return;

      const state = JSON.parse(starting.additionalData) as PollState;
      setPollState(state);
      setParticipants(state.participants);

      try {
        const persisted = await getPoll(state.pollId);
        const status = persisted?.status ?? "voting";

        if (status === "voting") {
          const v = await loadVotes(state.pollId);
          setVotes(v);
          setView("voting");
        } else if (status === "revealed") {
          const v = await loadVotes(state.pollId);
          setVotes(v);
          setView("results");
        } else {
          // scored
          const [v, events, fresh] = await Promise.all([
            loadVotes(state.pollId),
            loadScoreEvents(state.pollId),
            listParticipants(),
          ]);
          setVotes(v);
          setScoreEvents(events);
          setParticipants(fresh);
          setView("leaderboard");
        }
      } catch (err) {
        console.error("Error syncing main stage with DB:", err);
      }
    }
    initialize();
  }, []);

  if (!pollState) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper bg-confetti">
        <p className="font-heading text-2xl text-crayon-purple font-bold">Inicialitzant...</p>
      </div>
    );
  }

  const artist =
    participants.find((p) => p.id === pollState.correctParticipantId) ??
    pollState.participants.find((p) => p.id === pollState.correctParticipantId)!;

  if (view === "voting") {
    return (
      <div className="min-h-screen bg-paper bg-confetti py-8 px-4">
        <VotingProgress voteCount={votes.length} />
      </div>
    );
  }

  if (view === "results") {
    const results = calculateResults(votes, participants, pollState.correctParticipantId);
    return (
      <div className="min-h-screen bg-paper bg-confetti py-8 px-4">
        <ResultsView results={results} artist={artist} />
      </div>
    );
  }

  // leaderboard
  const deltasByParticipantId: Record<string, number> = {};
  for (const e of scoreEvents) {
    deltasByParticipantId[e.participantId] =
      (deltasByParticipantId[e.participantId] ?? 0) + e.delta;
  }

  return (
    <div className="min-h-screen bg-paper bg-confetti py-8 px-4">
      <LeaderboardView
        participants={participants}
        deltasByParticipantId={deltasByParticipantId}
      />
    </div>
  );
}
```

- [ ] **Step 19.2 — Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean — no errors anywhere in `src/`.

- [ ] **Step 19.3 — Build**

```bash
npm run build
```

Expected: build succeeds. Note any warnings (next will warn on unused vars, missing alt text, etc.) and fix them if reasonable.

- [ ] **Step 19.4 — Commit**

```bash
git add src/app/mainstage/page.tsx
git commit -m "✨ feat: rewrite main stage as three-state router (voting/results/leaderboard)"
```

---

## Task 20 — Manual end-to-end smoke test in dev server

**Files:** none modified.

This is hands-on verification of the whole flow. Two browser windows are easier than two tabs.

- [ ] **Step 20.1 — Start the dev server**

```bash
NEXT_PUBLIC_DEBUG=1 npm run dev
```

Expected: "Local: https://localhost:3000". Accept the self-signed cert in your browser.

- [ ] **Step 20.2 — Confirm participants seed**

In Supabase Studio (Table editor), open `participants`. Confirm 11 rows with `points = 0`.

- [ ] **Step 20.3 — Host setup flow**

In browser window A:
1. Open `https://localhost:3000/sidepanel`. The dropdown should list all 11 participants.
2. Pick "Pau" as the artist. Click "Començar votació".
3. The browser navigates to `/activitysidepanel`. The IdentityPicker should appear.
4. Click "Pau". The ArtistWaitingView should appear (because Pau is the artist).

In Supabase Studio:
- Confirm a row in `polls` with `status = 'voting'`, the new `pollId`, and `correct_participant_id` = Pau's UUID.

- [ ] **Step 20.4 — Voter flow**

In browser window B:
1. Open `https://localhost:3000/activitysidepanel`. IdentityPicker appears.
2. Click "Adri". The vote UI appears, with all 11 participants as options.
3. Pick "Pau" (correct guess). Click "Vota".
4. Confirmation appears: "Has votat per Pau".

In Supabase Studio:
- Confirm a row in `votes`: `voter_participant_id` = Adri's UUID, `voted_for_id` = Pau's UUID.

- [ ] **Step 20.5 — Reveal and leaderboard**

In browser window A (host, on the artist screen):

The host is also the artist (Pau). Open a third window or use the existing host window — the host's "Revelar resultats" button shows on the post-vote screen of the activity panel **for the host**, but if the host IS the artist they only see the artist screen and have no buttons. That's a real edge case. **Workaround for this smoke test:** restart with the host picking a different artist (e.g. host clicks "Canviar" in window A → re-pick a different identity, then go back to `/sidepanel` and start a fresh poll with a non-host artist).

Then in window A (host, voter view):
1. Click "Vota" for some option.
2. Click "Revelar resultats". In window A and B, voting should lock.
3. Click "Mostrar puntuació". In Supabase Studio, `polls.status` should be `'scored'`, `score_events` should have rows, and `participants.points` for Adri should be `+3` (correct guess).

Open `/mainstage` in a fourth window to watch the three-state transitions live.

- [ ] **Step 20.6 — Document the host-as-artist limitation**

If the host picks themselves as the artist, they have no reveal/show-leaderboard buttons because the artist screen has no host controls. This is the spec's intended behavior (the artist doesn't vote), but it does mean **the host must not pick themselves as the artist** if they expect to drive the reveal flow.

Add a note to `claude.md` near the activity-side-panel description:

> **Operational note:** The host should not pick themselves as today's artist. The artist sees a waiting screen with no controls; if the host is the artist, no one can press "Revelar resultats" or "Mostrar puntuació". Either pick a different artist or have a second host identity ready.

- [ ] **Step 20.7 — Commit the doc note**

```bash
git add claude.md
git commit -m "📚 docs: note that the host should not be the chosen artist"
```

---

## Task 21 — Final cleanup pass

**Files:** various touch-ups identified during smoke testing.

- [ ] **Step 21.1 — Run final typecheck and build**

```bash
npx tsc --noEmit
npm run build
```

Expected: both clean.

- [ ] **Step 21.2 — Audit for leftover references**

```bash
grep -rn "PollOption\|optionsSource\|predefined\|correctOptionId\|generateVoterId\|parseCustomOptions\|validateCustomOptions\|stringsToPollOptions\|voteDatabase\|VoteConfirmation\|VoteResults" src/ docs/ || echo "no stale refs"
```

Expected: only matches in `docs/superpowers/specs/` (the spec narrates the old names) and possibly in `IMPLEMENTATION_STATUS.md` (the archived historical doc — leave as-is).

- [ ] **Step 21.3 — Update `claude.md` to reflect the new architecture**

Replace the "Key Features → Poll Configuration" and "Data Flow" sections of `claude.md` with descriptions matching the new flow: participants table, identity selection, two-stage reveal, leaderboard. Use the spec at `docs/superpowers/specs/2026-05-15-artist-vote-gamification-design.md` as the source of truth.

Specifically:
- Remove "Predefined Lists" and "Custom Lists" subsections.
- Replace with a "Participants Table" section.
- Update the "Data Flow" diagram to: setup → identity pick → vote → reveal → score → leaderboard.
- Drop "Tiebreaker" references.
- Mention `score_poll` RPC and the four new tables.

- [ ] **Step 21.4 — Commit**

```bash
git add claude.md
git commit -m "📚 docs: update claude.md to match the gamified architecture"
```

---

## Self-review

### Spec coverage
- Data model (participants/polls/votes/score_events + publication) → Task 1.
- Scoring RPC with tunable constants → Task 1, Section "Scoring RPC".
- New `Participant`, `Vote`, `ScoreEvent`, `PollState`, `PollMessage` types → Task 2.
- Identity sessionStorage helpers → Task 3.
- Participants library + Postgres Changes subscription → Task 4.
- Polls library (create/get/reveal) → Task 5.
- Votes library (replaces voteDatabase) → Task 6 + Task 8 (deletion).
- Scoring RPC client wrapper → Task 7.
- Extended useVoteChannel with `SHOW_LEADERBOARD` → Task 8.
- Trimmed voteCalculations (calculateResults + generatePollId only) → Task 9.
- IdentityHeader (live points) → Task 10.
- IdentityPicker → Task 11.
- ArtistWaitingView → Task 12.
- VotingProgress (extracted) → Task 13.
- ResultsView (renamed + correct-guesser highlight) → Task 14.
- LeaderboardView (animated +N) → Task 15.
- Deleted predefinedOptions.json, VoteConfirmation.tsx → Task 16.
- Rewritten sidepanel (artist dropdown, createPoll) → Task 17.
- Rewritten activitysidepanel (identity/artist/vote + two-stage host buttons) → Task 18.
- Rewritten mainstage (three-state router, cold-start sync, CDC) → Task 19.
- Vote cutoff at reveal → enforced in Task 18 (`disabled={... hasRevealed}`) and Task 5 (`revealPoll` filters on `status='voting'`).
- Manual smoke test covering host setup, voting, reveal, scoring → Task 20.
- Doc updates → Task 20.7 (note) + Task 21.3 (claude.md).

### Open items called out in the plan, not gaps
- "Host == artist" is a real UX edge case discovered while writing — addressed in Task 20.6 with an operational note rather than code (consistent with the spec's "no enforcement" stance on identity collisions).

### Type consistency check
- `Vote { voterParticipantId, votedForId, timestamp }` used consistently across Tasks 2, 6, 8, 9, 18, 19.
- `PollState { pollId, correctParticipantId, participants, status }` used in Tasks 2, 17, 18, 19.
- `useVoteChannel` returns `sendVote / sendRevealCommand / sendShowLeaderboard / isConnected` consistently in Tasks 8, 18.
- `subscribeToParticipants` shared in Tasks 4, 10, 19.
- `calculateResults(votes, participants, correctParticipantId)` signature consistent in Tasks 9 and 19.
- `score_poll(p_poll_id)` parameter name consistent in Tasks 1 and 7.

### Placeholders
- No TBDs, no "implement later", no "add appropriate error handling" instructions.
- Where an inline confirmation replaces `VoteConfirmation`, the actual JSX is in Task 18 Step 18.1.
- Where animation behavior is described (`+N` badge), the actual Web Animations API code is in Task 15.
