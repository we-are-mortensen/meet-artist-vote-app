# Artist Vote — Gamification & Identified Voting

**Status:** Design approved, ready for implementation plan
**Date:** 2026-05-15

## Summary

Replace the current host-configured poll-option lists with a fixed `participants` table in Supabase. Use that same table as the source of truth for three things: the host's "who is the correct answer" dropdown, the voting options shown to participants, and a new self-identification selector that each participant uses before voting. Votes become identified (`voter_participant_id`, `voted_for_id`), enabling per-round Dixit-style scoring that accumulates into a running `points` total on each participant. Rework the main stage to a three-state flow culminating in a leaderboard view.

## Goals

- Eliminate host-side option configuration; one fixed list of participants for everything.
- Tie every vote to a known participant so we know who guessed correctly.
- Apply a Dixit-adapted scoring system, computed atomically on the server, with tunable constants.
- Present a two-stage reveal on the main stage: results, then leaderboard with animated point deltas.
- Show each participant their identity and live global score on every poll screen.

## Non-goals

- No admin UI for managing participants (manual via Supabase Studio).
- No identity-collision enforcement (last vote wins).
- No leaderboard reset UI (manual via Supabase Studio).
- No tiebreaker / second-round mechanic (dropped).
- No per-session or per-meeting scoping of scores (single global running total).
- No backfill of existing test data.

## Decisions

| Topic | Decision |
|---|---|
| Participants source | Single global `participants` table, managed manually in Supabase Studio. |
| Self-identification | Once per browser session via `sessionStorage`. A header on every participant screen shows the chosen name + live points, with a "Canviar" affordance to log out and reselect. |
| Identity collisions | Allowed silently; last vote per `(poll_id, voter_participant_id)` wins via UPSERT. |
| Self-vote rules | The correct participant ("the artist") does not vote. They see a dedicated waiting screen. Everyone else sees the full list, which includes the artist among the options. |
| Correct answer | Chosen by the host at setup from a dropdown of all participants, exactly like today, but sourced from the DB. |
| Scoring location | Server-side, in a Postgres `score_poll(p_poll_id)` function, called via Supabase RPC from the host's tab. |
| Persistence | `polls` + `votes` + `score_events` tables. Full per-round delta history. Cumulative totals on `participants.points`. |
| Scoring rules | If 0 correct guesses → artist +3. If all non-artist voters guessed correctly → each non-artist voter +1 (artist +0). Otherwise → artist +(total_votes − correct_votes), each correct guesser +3. Constants tunable in the RPC. |
| Sync strategy | Hybrid. Broadcast for ephemeral UX events (`VOTE_CAST`, `REVEAL_RESULTS`, `SHOW_LEADERBOARD`). Postgres Changes on `participants` for live points updates in the persistent identity header. |
| Reveal flow | Two host buttons: "Revelar resultats" (locks votes, flips poll to `revealed`, transitions main stage to results), then "Mostrar puntuació" (runs scoring RPC, transitions main stage to leaderboard). |
| Vote cutoff | At reveal. After the host clicks "Revelar resultats", votes are no longer accepted or displayed. |
| Results screen detail | Aggregate counts + percentages, with the names of correct guessers highlighted ("Qui ho ha encertat: …"). Wrong votes remain aggregated. |
| Tiebreaker | Dropped. Remove the `round` field and all related code. |
| Migration | Drop the existing `poll_votes` table. No data worth preserving. |
| Leaderboard reset | Done manually in Supabase Studio (`UPDATE participants SET points = 0`, optionally `TRUNCATE score_events`). |

## Data model

All in Supabase Postgres. Migration file kept in repo at `supabase/migrations/0001_init_artist_vote.sql` even though changes are applied manually in Studio.

### `participants`
Source of truth. Manually managed in Studio.

| column | type | constraints |
|---|---|---|
| `id` | `uuid` | PK, `default gen_random_uuid()` |
| `name` | `text` | NOT NULL, UNIQUE |
| `points` | `int` | NOT NULL DEFAULT 0 |
| `created_at` | `timestamptz` | NOT NULL DEFAULT now() |

### `polls`
One row per round.

| column | type | constraints |
|---|---|---|
| `id` | `text` | PK (keeps the existing `poll_<timestamp>_<rand>` format) |
| `correct_participant_id` | `uuid` | NOT NULL REFERENCES `participants(id)` |
| `status` | `text` | NOT NULL DEFAULT `'voting'`. One of `'voting' \| 'revealed' \| 'scored'`. |
| `scored_at` | `timestamptz` | NULL. Set by the scoring RPC; idempotency marker. |
| `created_at` | `timestamptz` | NOT NULL DEFAULT now() |

### `votes`
Replaces the old `poll_votes`.

| column | type | constraints |
|---|---|---|
| `poll_id` | `text` | NOT NULL REFERENCES `polls(id)` ON DELETE CASCADE |
| `voter_participant_id` | `uuid` | NOT NULL REFERENCES `participants(id)` |
| `voted_for_id` | `uuid` | NOT NULL REFERENCES `participants(id)` |
| `timestamp` | `bigint` | NOT NULL |
| PRIMARY KEY | | `(poll_id, voter_participant_id)` |

Composite PK enables "last vote wins" via `ON CONFLICT (poll_id, voter_participant_id) DO UPDATE`.

### `score_events`
Per-round point deltas. History + second idempotency layer.

| column | type | constraints |
|---|---|---|
| `id` | `bigserial` | PK |
| `poll_id` | `text` | NOT NULL REFERENCES `polls(id)` ON DELETE CASCADE |
| `participant_id` | `uuid` | NOT NULL REFERENCES `participants(id)` |
| `delta` | `int` | NOT NULL |
| `reason` | `text` | NOT NULL. One of `'nobody_guessed' \| 'all_guessed' \| 'correct_guess' \| 'artist_per_wrong_vote'`. |
| `created_at` | `timestamptz` | NOT NULL DEFAULT now() |
| UNIQUE | | `(poll_id, participant_id, reason)` |

### Realtime publication
Add `participants` to the `supabase_realtime` publication so clients can subscribe to `UPDATE` events on the `points` column.

## Scoring RPC

```sql
create or replace function score_poll(p_poll_id text)
returns void
language plpgsql
as $$
declare
  -- tunable scoring constants
  c_artist_nobody_guessed    int := 3;
  c_each_when_all_guessed    int := 1;
  c_correct_guess            int := 3;

  v_correct_id   uuid;
  v_total_votes  int;
  v_correct_cnt  int;
  v_wrong_cnt    int;
begin
  -- 1. Lock the poll row; bail out if already scored / not revealed.
  select correct_participant_id
    into v_correct_id
    from polls
   where id = p_poll_id
     and scored_at is null
     and status   = 'revealed'
   for update;

  if not found then
    return;
  end if;

  -- 2. Tally votes. Artist cannot vote, but defensively exclude their row.
  select count(*) into v_total_votes
    from votes
   where poll_id = p_poll_id
     and voter_participant_id <> v_correct_id;

  select count(*) into v_correct_cnt
    from votes
   where poll_id = p_poll_id
     and voter_participant_id <> v_correct_id
     and voted_for_id = v_correct_id;

  v_wrong_cnt := v_total_votes - v_correct_cnt;

  -- 3. Apply rules.
  if v_total_votes = 0 then
    null;  -- no voters, no scoring

  elsif v_correct_cnt = 0 then
    insert into score_events(poll_id, participant_id, delta, reason)
      values (p_poll_id, v_correct_id, c_artist_nobody_guessed, 'nobody_guessed');

  elsif v_correct_cnt = v_total_votes then
    insert into score_events(poll_id, participant_id, delta, reason)
      select p_poll_id, voter_participant_id, c_each_when_all_guessed, 'all_guessed'
        from votes
       where poll_id = p_poll_id
         and voter_participant_id <> v_correct_id;

  else
    insert into score_events(poll_id, participant_id, delta, reason)
      values (p_poll_id, v_correct_id, v_wrong_cnt, 'artist_per_wrong_vote');

    insert into score_events(poll_id, participant_id, delta, reason)
      select p_poll_id, voter_participant_id, c_correct_guess, 'correct_guess'
        from votes
       where poll_id = p_poll_id
         and voter_participant_id <> v_correct_id
         and voted_for_id = v_correct_id;
  end if;

  -- 4. Apply deltas to participants.points (one UPDATE per affected row).
  update participants p
     set points = points + agg.total_delta
    from (
      select participant_id, sum(delta) as total_delta
        from score_events
       where poll_id = p_poll_id
       group by participant_id
    ) agg
   where p.id = agg.participant_id;

  -- 5. Mark scored.
  update polls
     set scored_at = now(),
         status    = 'scored'
   where id = p_poll_id;
end;
$$;
```

### Properties

- `FOR UPDATE` + `scored_at IS NULL` + `status = 'revealed'` make it safe to call concurrently or twice; second call is a no-op.
- `UNIQUE (poll_id, participant_id, reason)` on `score_events` is a belt-and-braces second layer.
- The `votes = 0` branch silently records no scoring; the RPC still marks the poll `'scored'` so the UI can advance.
- All three tunable values live in the first three `declare` lines.
- `participants.points` updates trigger the Postgres Changes subscription on the client, driving live header updates everywhere.

### Client wrapper
`src/lib/scoring.ts`:
```ts
export async function scorePoll(pollId: string): Promise<void> {
  const { error } = await supabase.rpc('score_poll', { p_poll_id: pollId });
  if (error) throw new Error(`Failed to score poll: ${error.message}`);
}

export async function loadScoreEvents(pollId: string): Promise<ScoreEvent[]> { ... }
```

Only the host tab calls `scorePoll(pollId)` — gated on the "Mostrar puntuació" click.

## Identity & flow

### Session storage
```ts
sessionStorage["artistVote.identity"] = { id: "<participant uuid>", name: "<name>" }
```

The existing `hostOfPollId` key is unchanged. Host detection and identity are independent.

### IdentityHeader component
- Mounts at the top of `/activitysidepanel` (and any future participant-facing page).
- Renders `👤 {name} · 🏆 {points} punts` + a small "Canviar" link.
- Reads updates from the shared `subscribeToParticipants` stream and filters client-side to its own `id`; updates `points` live.
- "Canviar" clears `artistVote.identity` and re-renders the picker.

### Setup side panel (`/sidepanel`)
Heavily rewritten.
- Removes: predefined/custom radio, predefined dropdown, custom textarea, validation, preview, and any reference to `predefinedOptions.json` / `parseCustomOptions` / `validateCustomOptions`.
- Loads participants from DB on mount.
- Single dropdown: "Qui és l'artista d'avui?" populated from participants.
- "Començar votació":
  1. Generates `pollId` via existing helper.
  2. `INSERT INTO polls (id, correct_participant_id, status) VALUES (..., 'voting')`.
  3. Stores `hostOfPollId = pollId` in sessionStorage (unchanged).
  4. Calls `sidePanelClient.startActivity({ mainStageUrl, sidePanelUrl, additionalData: JSON.stringify({ pollId, correctParticipantId, participants }) })`.
  5. Redirects to `/activitysidepanel`.

`additionalData` carries the participants array so the main stage and late-joining activity panels don't need a separate fetch for cold start.

### Activity side panel (`/activitysidepanel`)
Branches on identity and poll state.

- **No identity in sessionStorage** → render `IdentityPicker` (scrollable list of all participants from `additionalData`). On selection, `setIdentity({id, name})` and re-render.
- **Identity matches `correctParticipantId`** → render `ArtistWaitingView` ("🎨 Avui l'artista ets tu!"). No vote UI. Receives `REVEAL_RESULTS` like everyone else.
- **Otherwise** → render `IdentityHeader` + vote UI. Selecting an option and submitting writes a row via UPSERT to `votes` (`(pollId, voterParticipantId, votedForId, Date.now())`) and broadcasts `VOTE_CAST`.

After voting:
- Show a small "has votat per X" confirmation.
- If the user is the host (`hostOfPollId === pollId`):
  - Before reveal: "Revelar resultats" button.
  - After their own `REVEAL_RESULTS` broadcast lands (or any other reveal event): "Mostrar puntuació" button replaces it.
  - "Mostrar puntuació" calls `scorePoll(pollId)` then broadcasts `SHOW_LEADERBOARD`.
- Receiving `REVEAL_RESULTS` locks the vote UI for non-hosts too.

### Vote cutoff
- Activity panels: on `REVEAL_RESULTS`, disable the submit button and stop sending broadcasts.
- Server: the scoring RPC only acts on polls in `'revealed'` status, and votes are read at scoring time. Late votes inserted after reveal would still be persisted but ignored by the RPC if the poll's already `'scored'`; to keep it tidy we also disable the client-side `sendVote` on reveal.

## Main stage

Becomes a thin three-state router. State driven by broadcast events plus an initial DB fetch for cold-start / late-joiner correctness.

### State 1 — voting
- "Qui és l'artista d'avui?" heading.
- Live vote counter (today's circular badge, extracted to `VotingProgress`).
- Bouncing-dots ambient animation.
- Listens for `REVEAL_RESULTS`.

### State 2 — results
- `ResultsView` (renamed from today's `VoteResults`, with a "Qui ho ha encertat" highlight added).
- Hero card with the correct participant's name.
- Aggregate vote breakdown + percentages.
- A "Qui ho ha encertat:" line listing the names of correct guessers (joining `votes` to `participants` by `voted_for_id = correct_participant_id`).
- Listens for `SHOW_LEADERBOARD`.

### State 3 — leaderboard
- Sorted list of all participants by `points` descending.
- For rows touched by this round's `score_events`, an animated `+N` badge appears (GSAP `from {y:-10, opacity:0}` → settled; brief highlight).
- Fetched once on transition: `loadScoreEvents(pollId)` → deltas map.
- Participants list comes from the local cache pushed by `additionalData`; `points` per row reflects the live values driven by Postgres Changes.
- Persistent until a new poll starts.

### Cold-start / late-joiner main stage
On mount:
1. Parse `additionalData` for `pollId`, `correctParticipantId`, `participants`.
2. Fetch `polls.status`.
   - `'voting'` → State 1, also `loadVotes(pollId)` for live count.
   - `'revealed'` → State 2, `loadVotes(pollId)` to populate the breakdown.
   - `'scored'` → State 3, `loadScoreEvents(pollId)` + read current `participants.points`.
3. Subscribe to Postgres Changes on `participants` so any live point updates flow through.

### Broadcast contract
Extend `PollMessage`:
```ts
type PollMessage =
  | { type: "VOTE_CAST";       payload: Vote;  timestamp: number }
  | { type: "REVEAL_RESULTS";  payload: null;  timestamp: number }
  | { type: "SHOW_LEADERBOARD"; payload: null; timestamp: number };
```

## File-level changes

### New
- `supabase/migrations/0001_init_artist_vote.sql` — schema + RPC + publication.
- `src/lib/participants.ts` — `listParticipants()`, `getParticipantById()`, and a single `subscribeToParticipants(callback)` Postgres Changes helper. Components (identity header, leaderboard) filter the stream client-side rather than opening separate subscriptions. The table is small and updates are infrequent, so one shared channel is enough.
- `src/lib/polls.ts` — `createPoll({pollId, correctParticipantId})`, `getPoll(pollId)`, `revealPoll(pollId)` (status update).
- `src/lib/votes.ts` — `saveVote(pollId, voterId, votedForId)`, `loadVotes(pollId)`. Replaces `voteDatabase.ts`.
- `src/lib/scoring.ts` — `scorePoll(pollId)`, `loadScoreEvents(pollId)`.
- `src/lib/identity.ts` — `getIdentity()`, `setIdentity({id,name})`, `clearIdentity()`.
- `src/components/IdentityHeader.tsx` — name + live points + "Canviar".
- `src/components/IdentityPicker.tsx` — first-time list screen.
- `src/components/ArtistWaitingView.tsx` — "avui l'artista ets tu" screen.
- `src/components/LeaderboardView.tsx` — sorted standings with `+N` deltas.
- `src/components/VotingProgress.tsx` — extracted live vote counter.

### Renamed
- `src/components/VoteResults.tsx` → `src/components/ResultsView.tsx` (correct-guessers highlight added).
- `src/lib/voteDatabase.ts` → `src/lib/votes.ts` (effectively rewritten against the new schema).

### Heavily rewritten
- `src/app/sidepanel/page.tsx` — strip configuration UI; load participants; pick artist; create poll row; start activity.
- `src/app/activitysidepanel/page.tsx` — branch on identity into picker / artist-waiting / vote UI; wire reveal + show-leaderboard host buttons.
- `src/app/mainstage/page.tsx` — three-state router driven by broadcast + initial fetch.
- `src/hooks/useVoteChannel.ts` — extend `PollMessage`; surface `sendShowLeaderboard()`. Keep current `sendVote`/`sendRevealCommand`.
- `src/types/poll.types.ts` — replace anonymous types with new shape: `Participant`, `PollState { pollId, correctParticipantId, participants }`, `Vote { voterParticipantId, votedForId, timestamp }`, `ScoreEvent`. Drop `PredefinedList*`, `optionsSource`, `round`.
- `src/utils/voteCalculations.ts` — drop `generateVoterId`, `parseCustomOptions`, `validateCustomOptions`, `stringsToPollOptions`. Keep `generatePollId`. Adapt `calculateResults` to the new vote shape (or fold into `ResultsView` if no longer reused).

### Deleted
- `src/data/predefinedOptions.json`
- `src/components/VoteConfirmation.tsx` (replaced by inline state in activity panel)
- The `poll_votes` table in Supabase (manual drop).

### Untouched
- `src/app/page.tsx`
- `src/app/layout.tsx`, `globals.css`, all theme tokens / utility classes.
- `src/shared/constants.ts`
- Google Meet SDK wiring (`CLOUD_PROJECT_NUMBER`, screenshare addon).

## Open questions / things deferred

- Exact visual styling of the leaderboard `+N` animation. GSAP is fine; tune once it's on screen.
- Whether to expose a "history of polls" view later (data is captured in `polls` + `score_events`, so it's available).
- Whether identity should ever auto-detect from the Meet participant name in the future. Out of scope here.

## Risks

- **Identity drift in `additionalData`**: if a participant is added to the DB *after* an activity has started, they won't appear in the activity panel's option list for that poll (because the list was passed via `additionalData`). Acceptable for now; the host can re-start the activity. Document this in the README.
- **Postgres Changes throttling**: `participants` updates are infrequent (one batched UPDATE per scored poll). No throttling concerns at the meeting-room scale this is built for.
- **Concurrent host clicks**: two host tabs both clicking "Mostrar puntuació" are safe — the RPC is idempotent. But each would still broadcast `SHOW_LEADERBOARD`. The main stage handles duplicate transitions by checking its current state before re-rendering.
