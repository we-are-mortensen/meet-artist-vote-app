# Implementation Status

## Status: gamified v2 — shipped

The Artist Vote add-on has been reworked from anonymous voting on host-configured option lists into a gamified, identified-voting system backed by a shared `participants` table and a server-side scoring RPC.

The full design is in `docs/superpowers/specs/2026-05-15-artist-vote-gamification-design.md`. The implementation plan is in `docs/superpowers/plans/2026-05-15-artist-vote-gamification.md`. Both are point-in-time records; this file describes the *current* state.

---

## What's in place

### Database (Supabase Postgres)

- `participants` — `id`, `name`, `points`, `created_at`. Source of truth, managed manually in Studio.
- `polls` — `id`, `correct_participant_id`, `status` (`voting` / `revealed` / `scored`), `scored_at`.
- `votes` — `poll_id`, `voter_participant_id`, `voted_for_id`, `timestamp`. PK `(poll_id, voter_participant_id)`. UPSERT for "last vote wins".
- `score_events` — `poll_id`, `participant_id`, `delta`, `reason`. Per-round history.
- `score_poll(p_poll_id text)` RPC — atomic, idempotent, with three tunable constants at the top.
- `participants` is in the `supabase_realtime` publication for CDC.

Migration file: `supabase/migrations/0001_init_artist_vote.sql`.

### Host setup

- Single dropdown sourced from `participants`. Picks today's artist.
- "Començar votació" creates a `polls` row and calls `MeetSidePanelClient.startActivity` with a `PollState` payload (`pollId`, `correctParticipantId`, snapshot of `participants`).
- Sets `sessionStorage["hostOfPollId"] = pollId` to mark the host tab.

### Participant flow

- First load: `IdentityPicker` lets the participant pick themselves. Choice stored under `sessionStorage["artistVote.identity"]`.
- Returning visitor: skips picker. `IdentityHeader` shows their name and live points (Postgres Changes subscription on `participants`).
- If the chosen identity matches the round's artist: `ArtistWaitingView` (no vote UI).
- Otherwise: `OptionList` with every participant. Submission UPSERTs to `votes` and broadcasts `VOTE_CAST`.
- Re-voting before reveal replaces the previous vote (PK conflict → UPDATE).

### Two-stage reveal

- Host's "Revelar resultats" → `revealPoll` flips `polls.status='revealed'`, broadcasts `REVEAL_RESULTS`. Voting locks across all clients.
- Host's "Mostrar puntuació" → `scorePoll` calls the `score_poll` RPC, then broadcasts `SHOW_LEADERBOARD`.

### Main stage

Three-state router:

1. **Voting** — `VotingProgress` live counter.
2. **Results** — `ResultsView` with the artist hero card and "Qui ho ha encertat:" highlight.
3. **Leaderboard** — `LeaderboardView` with sorted standings, animated `+N` badges via Web Animations API.

Cold-start syncs by fetching `polls.status` on mount — late joiners land in the correct view regardless of when they connect. Postgres Changes subscription keeps `participants.points` live in all views.

### Scoring rules (in `score_poll`)

- 0 correct guesses → artist `+3`.
- Every non-artist voter guessed correctly → each correct guesser `+1`, artist `+0`.
- Mixed → artist `+(total_votes − correct_votes)`, each correct guesser `+3`.
- 0 voters → no-op (still marks `polls.status='scored'` so the UI can advance).

Constants live at the top of the function as `c_artist_nobody_guessed`, `c_each_when_all_guessed`, `c_correct_guess`.

### Theme

Unchanged. Crayon palette, hand-drawn borders, Baloo 2 / Nunito, dark mode, confetti background.

---

## Operational notes

- **Host should not be the artist.** The artist screen has no controls; if the host picks themselves, nobody can press reveal or scoring.
- **Identity collisions allowed.** If two browser tabs pick the same participant, both can vote — the second submission overwrites the first.
- **Leaderboard reset** is a manual SQL operation in Supabase Studio. See `README.md` → "Managing data in Supabase".
- **No admin UI.** Adding/removing participants is done directly in Studio.

---

## What's not implemented (intentional)

- Tiebreaker / second-round mechanic — dropped in the v2 design.
- Admin UI for participants — out of scope; manual in Studio.
- Per-session or per-meeting leaderboard scoping — single global running total.
- Test framework — no automated tests; verification is typecheck + build + manual smoke. See `TESTING_GUIDE.md`.
- Auto-detection of identity from the Meet participant name — possible future enhancement.

---

## Verification

- `npx tsc --noEmit` — clean.
- `npm run build` — clean (6 static pages generated).
- End-to-end manual smoke confirmed by the user against the live Supabase project.

---

## Documentation map

- `README.md` — quick start and architecture overview.
- `CLAUDE.md` — full architecture, conventions, and technical details for future agents.
- `TESTING_GUIDE.md` — test scenarios for the gamified flow.
- `IMPLEMENTATION_STATUS.md` — this file.
- `docs/superpowers/specs/2026-05-15-artist-vote-gamification-design.md` — the spec.
- `docs/superpowers/plans/2026-05-15-artist-vote-gamification.md` — the implementation plan.
- `supabase/migrations/0001_init_artist_vote.sql` — the schema and RPC.
