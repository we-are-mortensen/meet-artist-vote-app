# Artist Vote - Google Meet Add-on

## Project Overview

This is a Next.js project that creates a Google Meet Add-on for a gamified daily artist-guessing round. The host picks today's artist from a shared participants table; everyone else picks themselves once (identity stays in `sessionStorage`) and then votes for who they think today's artist is. After the host reveals the answer, a Dixit-inspired scoring rule awards points and the main stage cycles to a leaderboard.

**Important Context:**
- All code and comments are in English
- All user-facing content must be in Catalan
- The poll question is about who is today's artist ("Qui és l'artista d'avui?" in Catalan)
- Poll options come from the shared `participants` table — same source feeds the host's artist dropdown, the voter's option list, and the identity picker
- Voting is identified: every vote stores `voter_participant_id` and `voted_for_id`
- Scoring rules live server-side in the `score_poll` RPC; tunable constants are SQL-side

## Technology Stack

- **Framework**: Next.js 16.0.5 (App Router)
- **Runtime**: React 19.2.0
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS 4, PostCSS
- **Google Meet SDK**: @googleworkspace/meet-addons ^1.2.0
- **Real-time Communication**: Supabase Realtime (Broadcast for poll events + Postgres Changes on `participants`)
- **Database**: Supabase Postgres (`participants`, `polls`, `votes`, `score_events`) + `score_poll` RPC for scoring
- **Build Tool**: Next.js with Turbopack

## Project Structure

```
/src
  /app                          # Next.js App Router pages
    /activitysidepanel         # Side panel shown to participants during activity
      page.tsx                 # Voting interface for participants
    /mainstage                 # Main stage view (large screen)
      page.tsx                 # Real-time voting results display
    /sidepanel                 # Initial side panel for activity setup
      page.tsx                 # Host picks today's artist from the participants table
    page.tsx                   # Screenshare landing page
    layout.tsx                 # Root layout with playful fonts
    icon.svg                   # App icon (green striped design)
    globals.css                # Global styles with playful theme
  /components                   # Reusable UI components
    PollQuestion.tsx           # Displays poll question in Catalan
    OptionList.tsx             # Lists participants as radio buttons for voting
    VoteButton.tsx             # Submit vote button
    VotingProgress.tsx         # Live vote count on the main stage
    ResultsView.tsx            # Reveal screen: correct artist + correct-guessers
    LeaderboardView.tsx        # Sorted standings with animated +N deltas
    IdentityPicker.tsx         # First-load picker for "who am I?"
    IdentityHeader.tsx         # Persistent header with name + live points
    ArtistWaitingView.tsx      # Shown to the participant who IS the artist
  /hooks
    useVoteChannel.ts          # Supabase Realtime hook for vote pub/sub
  /lib
    supabase.ts                # Supabase client singleton
    participants.ts            # Loads participants from Supabase
    polls.ts                   # Creates / updates / reads polls rows
    votes.ts                   # Identified vote upsert + load helpers
    scoring.ts                 # Client wrapper for the score_poll RPC
    identity.ts                # sessionStorage identity helpers
  /shared
    constants.ts               # Configuration constants
  /types
    poll.types.ts              # TypeScript type definitions
  /utils
    voteCalculations.ts        # Vote tally helper (calculateResults)
```

## Key Configuration

### Constants ([src/shared/constants.ts](src/shared/constants.ts))

```typescript
// Google Cloud Project identifier
export const CLOUD_PROJECT_NUMBER = '315905898182';

// Base URL (switches based on debug mode)
export const SITE_BASE = inDebugMode()
  ? 'https://localhost:3000'
  : 'https://we-are-mortensen.github.io/meet-artist-vote-app';

// URL endpoints
export const MAIN_STAGE_URL = SITE_BASE + '/mainstage';
export const SIDE_PANEL_URL = SITE_BASE + '/sidepanel';
export const ACTIVITY_SIDE_PANEL_URL = SITE_BASE + '/activitysidepanel';
```

Debug mode is controlled by environment variable: `process.env.NEXT_PUBLIC_DEBUG === '1'`

### Supabase Configuration

The app uses Supabase for both data (participants/polls/votes/scoring) and Realtime (Broadcast + Postgres Changes). Required environment variables in `.env`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your-anon-key
```

## Google Meet Add-on Architecture

### Four Main Components

1. **Screenshare Landing Page** ([src/app/page.tsx](src/app/page.tsx))
   - Entry point for installing/opening the add-on
   - Uses `meet.addon.screensharing.exposeToMeetWhenScreensharing()`
   - Opens side panel for activity setup
   - `startActivityOnOpen: false` - requires manual start

2. **Side Panel** ([src/app/sidepanel/page.tsx](src/app/sidepanel/page.tsx))
   - Shown to the host for setup
   - Loads the full participant list from the Supabase `participants` table
   - Single dropdown ("Qui és l'artista d'avui?") to pick today's artist
   - "Començar votació" inserts a new row into `polls` (status `voting`, `correct_participant_id` set), then calls `MeetSidePanelClient.startActivity()` with:
     - `mainStageUrl` / `sidePanelUrl`
     - `additionalData`: JSON `PollState` containing `pollId`, `correctParticipantId`, and the snapshot of `participants`
   - **Host Detection**: Sets `sessionStorage.setItem('hostOfPollId', pollId)` before redirecting to the activity side panel

3. **Activity Side Panel** ([src/app/activitysidepanel/page.tsx](src/app/activitysidepanel/page.tsx))
   - Shown to all participants during the activity
   - First-load flow: `IdentityPicker` lets the participant pick themselves from the participants table. Result stored under `sessionStorage` key `artistVote.identity`.
   - Returning visitor (identity already in storage) skips the picker. Persistent `IdentityHeader` displays their name + live points, subscribing to Postgres Changes on `participants` so points update without reloads.
   - If the chosen identity matches the round's artist: renders `ArtistWaitingView` (no vote UI, no host controls).
   - Otherwise: renders `OptionList` with all participants. Submitting upserts a row into `votes` keyed by `(poll_id, voter_participant_id)` — "last vote wins" until the host reveals.
   - **Host-only controls** (visible when `sessionStorage.getItem('hostOfPollId') === pollId`): two sequential buttons. "Revelar resultats" flips `polls.status` to `revealed` and broadcasts `REVEAL_RESULTS`; "Mostrar puntuació" calls the `score_poll` RPC and broadcasts `SHOW_LEADERBOARD`.
   - Voting cuts off at reveal — late voters get a closed state.

4. **Main Stage** ([src/app/mainstage/page.tsx](src/app/mainstage/page.tsx))
   - Large screen view shown to all participants
   - Creates `MeetMainStageClient` and reads `additionalData` (`pollId`, `correctParticipantId`, `participants`) via `getActivityStartingState()`
   - Three-state router: `voting` (live `VotingProgress` count) → `results` (`ResultsView` with correct artist + correct-guessers highlight) → `leaderboard` (`LeaderboardView`, sorted standings with animated `+N` deltas).
   - Cold-start: after parsing `additionalData`, fetches `polls.status` from Supabase and syncs the view (handles late joiners arriving mid-round or post-reveal).
   - Subscribes to the Supabase Realtime channel for `VOTE_CAST`, `REVEAL_RESULTS`, and `SHOW_LEADERBOARD` events, and to Postgres Changes on `participants` so live point updates flow through to the leaderboard.

### Current Implementation

The app implements a gamified daily round of "Qui és l'artista d'avui?":
- **Poll Setup**: Host loads participants from Supabase and picks today's artist from a dropdown; pressing "Començar votació" creates a `polls` row and starts the activity
- **Identity**: Each participant picks themselves once on first load; identity persists in `sessionStorage` and drives the live points header
- **Voting**: Identified votes (`voter_participant_id`, `voted_for_id`); the participant who is today's artist sees a waiting screen instead of vote UI
- **Two-stage Reveal**: Host first reveals the correct answer + the list of correct guessers; then triggers scoring, which transitions the main stage to a leaderboard
- **Scoring**: Server-side `score_poll` RPC implements Dixit-adapted rules with SQL-tunable constants; results are persisted via `score_events` rows and aggregated on `participants.points`
- **Data Flow**: Supabase Realtime Broadcast for poll events + Postgres Changes on `participants` for live point updates
- **Host Detection**: `sessionStorage` (`hostOfPollId`) tracks which browser tab started the poll

## Development Setup

### Installation
```bash
npm install
```

### Running Development Server
```bash
npm run dev
# Runs on https://localhost:3000 when NEXT_PUBLIC_DEBUG=1
```

### Building for Production
```bash
npm run build
npm start
```

### Environment Variables
- `NEXT_PUBLIC_DEBUG=1` - Enables localhost mode, otherwise uses GitHub Pages URL
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` - Supabase anonymous/public key

## Key Features

### Participants Table
- **Source of truth**: the `participants` table in Supabase — columns `id` (uuid), `name` (text), `points` (int, default 0), `created_at` (timestamptz).
- **Managed manually in Supabase Studio.** There is no admin UI inside the add-on.
- **One list, three uses**: the same `participants` rows feed the host's artist dropdown (sidepanel), the voting options shown to every other participant (activity side panel), and the identity picker each participant sees on first load.

### Voting System
- **Identified votes**: every row in `votes` stores `poll_id`, `voter_participant_id`, `voted_for_id`, and a timestamp. There is no anonymous fallback.
- **Artist exception**: the participant whose identity matches `polls.correct_participant_id` sees `ArtistWaitingView` and does not vote.
- **One vote per voter per poll**: the table has a unique constraint on `(poll_id, voter_participant_id)`. Submissions UPSERT, so "last vote wins" until reveal.
- **Cutoff**: once the host flips `polls.status` to `revealed`, the activity panel shows the closed state and stops accepting changes.

### Results Display
- **Two-stage reveal**, driven by two separate host buttons.
- **Stage 1 — "Revelar resultats"**: the main stage swaps to `ResultsView`, showing the correct artist, the aggregate vote breakdown, and a "Qui ho ha encertat:" list of the participants who guessed correctly.
- **Stage 2 — "Mostrar puntuació"**: the server-side `score_poll(poll_id)` RPC runs (Dixit-adapted rules; constants live in the SQL function so they can be tuned without a redeploy), `participants.points` is updated, and the main stage transitions to `LeaderboardView` — sorted standings with `+N` deltas animated in via Postgres Changes on `participants`.

### Host Detection System
The app uses `sessionStorage` to reliably identify the activity host:
1. When the initiator clicks "Començar votació" in sidepanel, the `pollId` is saved to sessionStorage as `hostOfPollId`
2. After redirect to activitysidepanel, the stored `pollId` is compared with the current poll's ID
3. If they match, the user is the host and sees host-only features (the "Revelar resultats" and "Mostrar puntuació" buttons)
4. This approach handles multiple activities in the same browser session correctly

**Host vs artist:** The host should not pick themselves as today's artist. The artist sees a waiting screen with no controls; if the host is the artist, no one can press "Revelar resultats" or "Mostrar puntuació". Either pick a different artist or have a second host identity ready.

### Data Flow
```
Setup Side Panel (host)
  ↓ load participants from DB
  ↓ pick artist
  ↓ INSERT INTO polls (status='voting')
  ↓ startActivity({additionalData: {pollId, correctParticipantId, participants}})
  ↓ sessionStorage.hostOfPollId = pollId
Activity Side Panel
  ↓ IdentityPicker (first time) → sessionStorage.artistVote.identity
  ↓ IdentityHeader (live points via Postgres Changes)
  ↓ artist → ArtistWaitingView | other → vote UI
  ↓ vote: UPSERT votes (voter, votedFor, ts), broadcast VOTE_CAST
  ↓ host reveals: UPDATE polls.status='revealed', broadcast REVEAL_RESULTS
  ↓ host shows points: rpc score_poll(pollId), broadcast SHOW_LEADERBOARD
Main Stage
  ↓ state machine: voting → results → leaderboard
  ↓ subscribes to Postgres Changes on participants for live points
```

### Supabase Realtime Integration

The app combines two Supabase Realtime modes:

- **Tables**: `participants`, `polls`, `votes`, `score_events`. `participants` is included in the `supabase_realtime` publication so Postgres Changes (CDC) on `points` fan out to every client.
- **Broadcast channel**: `poll-votes-${pollId}` — kept from the previous design, still isolates poll sessions, but now carries three event types:
  - `VOTE_CAST` — sent by voters after a successful upsert; the main stage uses it to update the live count.
  - `REVEAL_RESULTS` — sent by the host's first button; transitions every client to the reveal screen.
  - `SHOW_LEADERBOARD` — sent by the host's second button after `score_poll` returns; transitions the main stage to the leaderboard.
- **useVoteChannel hook** ([src/hooks/useVoteChannel.ts](src/hooks/useVoteChannel.ts)): subscribes/publishes to the broadcast channel, exposes typed send helpers and receive callbacks, and cleans up on unmount.

### Google Meet Add-ons SDK Key Methods

- `meet.addon.createAddonSession({ cloudProjectNumber })` - Initialize session
- `session.createMainStageClient()` - Get main stage client
- `session.createSidePanelClient()` - Get side panel client
- `mainStageClient.getActivityStartingState()` - Get initial data (`pollId`, `correctParticipantId`, participants snapshot)
- `sidePanelClient.startActivity({ mainStageUrl, sidePanelUrl, additionalData })` - Start activity

## Styling

The app uses a **playful, childish theme** inspired by children's drawing and coloring books.

### Theme System ([src/app/globals.css](src/app/globals.css))

**Crayon Color Palette:**
- `--crayon-red`: #EE4266
- `--crayon-orange`: #FFA62F
- `--crayon-yellow`: #FFD23F
- `--crayon-green`: #06D6A0
- `--crayon-blue`: #118AB2
- `--crayon-purple`: #9B5DE5
- `--crayon-pink`: #F15BB5

**Background Colors:**
- `--bg-paper`: #FFF8E7 (light) / #2D2A24 (dark)
- `--bg-card`: #FFFFFF (light) / #3D3A34 (dark)

**Typography:**
- Headings: 'Baloo 2' (playful, rounded)
- Body: 'Nunito' (friendly, readable)

**Utility Classes:**
- `.hand-drawn` - Wobbly organic border-radius effect
- `.shadow-playful` - Colorful offset shadows
- `.hover-bounce` - Bouncy hover animation
- `.animate-wiggle` - Fun wiggle animation
- `.bg-confetti` - Scattered colorful dots background
- `.paper-texture` - Subtle paper texture overlay
- `.underline-crayon` - Crayon-style text underline

**Features:**
- Dark mode support via `prefers-color-scheme`
- CSS custom properties for theme tokens
- Tailwind CSS 4 with `@theme inline` directive

## Git Information

- Current branch: `master`
- Main branch: `master`
- Repository is hosted on GitHub: `we-are-mortensen/meet-artist-vote-app`
- GitHub Pages URL: https://we-are-mortensen.github.io/meet-artist-vote-app

## Important Links

- [Google Meet Add-ons Quickstart](https://developers.google.com/workspace/meet/add-ons/guides/quickstart)
- [Google Meet Add-ons Overview](https://developers.google.com/meet/add-ons/guides/overview)
- [Main Stage Guide](https://developers.google.com/meet/add-ons/guides/overview#main-stage)
- [Side Panel Guide](https://developers.google.com/meet/add-ons/guides/overview#side-panel)
- [Screensharing Guide](https://developers.google.com/meet/add-ons/guides/screen-sharing)
- [SDK Reference](https://developers.google.com/meet/add-ons/reference/websdk/addon_sdk)

## TypeScript Configuration

- Target: ES2017
- JSX: react-jsx (React 19 automatic JSX transform)
- Strict mode enabled
- Path alias: `@/*` maps to `./src/*`
- Module resolution: bundler

## Testing

See [TESTING_GUIDE.md](TESTING_GUIDE.md) for comprehensive testing instructions including:
- Local testing procedures
- Google Meet testing flow
- Test scenarios (identity picking, voting, reveal flow, scoring, leaderboard)
- Visual and functional testing checklists
- Common issues and solutions

## Documentation

- **README.md**: Quick start guide and project overview
- **CLAUDE.md** (this file): Complete architecture, features, and technical details
- **IMPLEMENTATION_STATUS.md**: Current implementation status and completion summary
- **TESTING_GUIDE.md**: Step-by-step testing instructions and test scenarios

### Archived Documentation
- **DEVELOPMENT_PLAN.md.archived**: Original development plan (superseded)
- **IMPLEMENTATION_SUMMARY.md.archived**: Old implementation summary (outdated)
- **POLL_OPTIONS_MODIFICATION_PLAN.md.archived**: Poll options feature plan (completed)
