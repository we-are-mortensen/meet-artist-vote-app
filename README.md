# Artist Vote — Google Meet Add-on

A Google Meet add-on for a gamified daily artist-guessing round: "Qui és l'artista d'avui?". The host picks today's artist from a shared participants table; everyone else identifies themselves once and votes for who they think it is. After the reveal, a Dixit-inspired scoring rule awards points and the main stage cycles to a leaderboard.

## Features

- **Shared participants table**: One source of truth for the host's artist dropdown, the voter's option list, and the per-participant identity picker.
- **Identified voting**: Every vote stores `voter_participant_id` and `voted_for_id`, so we know exactly who guessed correctly.
- **Two-stage reveal**: Host clicks "Revelar resultats" to lock voting and reveal the artist + correct guessers; then "Mostrar puntuació" to run scoring and transition the main stage to a leaderboard with animated point deltas.
- **Server-side scoring**: A `score_poll(p_poll_id)` Postgres RPC applies a Dixit-adapted rule with tunable constants. Atomic and idempotent.
- **Live leaderboard**: Persistent `IdentityHeader` shows every participant their name and global score, with live updates via Postgres Changes on `participants`.
- **Playful theme**: Catalan UI, crayon palette, hand-drawn borders, dark mode.

## Scoring rules

Computed in `score_poll`:

- If **nobody** guesses the artist → artist gets **3** points.
- If **everyone** (every non-artist voter) guesses correctly → each correct guesser gets **1** point, artist gets **0**.
- Otherwise → artist gets `total_votes − correct_votes`, each correct guesser gets **3**.

The three constants (3 / 1 / 3) live at the top of the function — change them to retune.

## Technology stack

- Next.js 16 (App Router) + React 19 + TypeScript 5
- Tailwind CSS 4 (Baloo 2 + Nunito fonts)
- Google Meet Add-ons SDK v1.2.0
- Supabase Postgres + Realtime (Broadcast for poll events, Postgres Changes on `participants`)

## Getting started

### Prerequisites

- Node.js
- Supabase project with the four tables and `score_poll` RPC installed (see `supabase/migrations/0001_init_artist_vote.sql`)
- Google Meet Add-on registered (Cloud Project Number `315905898182`)

### Install

```bash
npm install
```

### Develop

```bash
NEXT_PUBLIC_DEBUG=1 npm run dev
```

Opens at `https://localhost:3000`.

### Build

```bash
npm run build
npm start
```

### Environment variables

```
NEXT_PUBLIC_DEBUG=1
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your-anon-key
```

### Database setup

Apply `supabase/migrations/0001_init_artist_vote.sql` once in the Supabase SQL editor. Then seed participants:

```sql
insert into public.participants (name) values
  ('Adri'), ('Anita'), ('Annna'), ('Anto'), ('Edwin'),
  ('Maria'), ('Marie'), ('Martina'), ('Naomí'), ('Nika'), ('Pau');
```

Adjust the list to your team.

## How a round works

1. **Host opens the side panel.** Selects today's artist from the dropdown (sourced from `participants`).
2. **"Començar votació"** inserts a row into `polls` and starts the activity.
3. **Each participant** sees the identity picker on first load; their choice is stored under `sessionStorage["artistVote.identity"]` and reused for subsequent rounds.
4. **The chosen artist** sees a waiting screen — no vote UI, no host controls.
5. **Everyone else** sees the full participant list and votes. Re-voting is allowed (UPSERT, last vote wins) until the host reveals.
6. **Host clicks "Revelar resultats"** → `polls.status='revealed'`, votes lock, main stage transitions to the results view (correct artist hero card + "Qui ho ha encertat:" list).
7. **Host clicks "Mostrar puntuació"** → `score_poll` RPC runs, `participants.points` updates, main stage transitions to the leaderboard with animated `+N` badges. Postgres Changes pushes the new points to every connected client's header.

> **Don't pick yourself as the artist if you're hosting.** The artist screen has no host controls — there'd be nobody to press the reveal or scoring buttons. Either pick someone else, or have a second host identity ready.

## Managing data in Supabase

Everything is managed manually in Supabase Studio. There is no admin UI.

- **Add/remove participants**: edit the `participants` table directly.
- **Reset the leaderboard** (keep history):
  ```sql
  update public.participants set points = 0;
  ```
- **Full clean slate** (also wipe past rounds):
  ```sql
  truncate public.score_events restart identity;
  delete from public.polls;
  update public.participants set points = 0;
  ```

## Project structure

```
/src
  /app
    /sidepanel             Host setup (artist dropdown)
    /activitysidepanel     Participant flow (identity → vote → host controls)
    /mainstage             Three-state router: voting → results → leaderboard
    page.tsx               Screenshare landing page
  /components              Presentation components (see CLAUDE.md for the list)
  /hooks
    useVoteChannel.ts      Broadcast channel for VOTE_CAST / REVEAL_RESULTS / SHOW_LEADERBOARD
  /lib
    supabase.ts            Client
    participants.ts        List + CDC subscription
    polls.ts               create / get / reveal
    votes.ts               UPSERT + load
    scoring.ts             score_poll RPC wrapper + loadScoreEvents
    identity.ts            sessionStorage wrapper
  /types/poll.types.ts
  /utils/voteCalculations.ts
/supabase
  /migrations/0001_init_artist_vote.sql
```

## Documentation

- **README.md** — this file, quick start.
- **CLAUDE.md** — architecture, conventions, technical details.
- **TESTING_GUIDE.md** — test scenarios for the gamified flow.
- **IMPLEMENTATION_STATUS.md** — current feature status.
- **docs/superpowers/specs/** and **docs/superpowers/plans/** — point-in-time design and implementation records.

## Learn more

- [Google Meet Add-ons](https://developers.google.com/meet/add-ons)
- [Supabase Realtime](https://supabase.com/docs/guides/realtime)
- [Next.js](https://nextjs.org/docs)
- [Tailwind CSS](https://tailwindcss.com)
