# Artist Vote - Google Meet Add-on

## Project Overview

This is a Next.js project that creates a Google Meet Add-on for voting on who is today's artist. The poll initiator can choose between predefined lists or create a custom list of options. All participants vote anonymously, and results are displayed in real-time on the "mainstage" (the large screen view of the add-on).

**Important Context:**
- All code and comments are in English
- All user-facing content must be in Catalan
- The poll question is about who is today's artist ("Qui és l'artista d'avui?" in Catalan)
- Poll options are defined by the initiator (not participant names)
- Voting is anonymous (no registration required)
- Future enhancement planned: implement a second poll in case of a tie, showing only the tied options

## Technology Stack

- **Framework**: Next.js 16.0.5 (App Router)
- **Runtime**: React 19.2.0
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS 4, PostCSS
- **Google Meet SDK**: @googleworkspace/meet-addons ^1.2.0
- **Real-time Communication**: Supabase Realtime (Broadcast)
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
      page.tsx                 # Poll configuration (predefined/custom options)
    page.tsx                   # Screenshare landing page
    layout.tsx                 # Root layout
    icon.svg                   # App icon (green striped design)
    globals.css                # Global styles with Tailwind
  /components                   # Reusable UI components
    PollQuestion.tsx           # Displays poll question in Catalan
    OptionList.tsx             # Lists poll options as radio buttons
    VoteButton.tsx             # Submit vote button
    VoteConfirmation.tsx       # Post-vote confirmation message
    VoteResults.tsx            # Results display with bars and percentages
  /data
    predefinedOptions.json     # Predefined poll option lists
  /hooks
    useVoteChannel.ts          # Supabase Realtime hook for vote pub/sub
  /lib
    supabase.ts                # Supabase client singleton
  /shared
    constants.ts               # Configuration constants
  /types
    poll.types.ts              # TypeScript type definitions
  /utils
    voteCalculations.ts        # Vote calculation and validation utilities
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

The app uses Supabase Realtime for vote synchronization. Required environment variables in `.env`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your-anon-key
```

## Google Meet Add-on Architecture

### Three Main Components

1. **Screenshare Landing Page** ([src/app/page.tsx](src/app/page.tsx))
   - Entry point for installing/opening the add-on
   - Uses `meet.addon.screensharing.exposeToMeetWhenScreensharing()`
   - Opens side panel for activity setup
   - `startActivityOnOpen: false` - requires manual start

2. **Side Panel** ([src/app/sidepanel/page.tsx](src/app/sidepanel/page.tsx))
   - Shown to the activity initiator for setup
   - Poll configuration interface:
     - Radio buttons to choose between predefined or custom options
     - Dropdown to select from 3 predefined lists (default, team, simple)
     - Textarea to enter custom options (one per line)
     - Validation: 2-50 options, no duplicates
     - Preview of selected options
   - Creates `MeetSidePanelClient`
   - Calls `startActivity()` with:
     - `mainStageUrl`: URL for main stage
     - `sidePanelUrl`: URL for activity side panel
     - `additionalData`: JSON string with PollState (includes options array)
   - After starting, redirects to activity side panel

3. **Activity Side Panel** ([src/app/activitysidepanel/page.tsx](src/app/activitysidepanel/page.tsx))
   - Shown to all participants during the activity
   - No registration required - voting interface appears immediately
   - Displays poll question and list of options as radio buttons
   - Generates anonymous voter ID on load
   - Submit vote button
   - Uses Supabase Realtime broadcast to send votes
   - Shows confirmation after voting

4. **Main Stage** ([src/app/mainstage/page.tsx](src/app/mainstage/page.tsx))
   - Large screen view shown to all participants
   - Creates `MeetMainStageClient`
   - Gets poll options from starting state via `getActivityStartingState()`
   - Subscribes to Supabase Realtime channel for vote updates
   - Real-time vote aggregation and results display
   - Shows vote counts, percentages, progress bars
   - Announces winner (or tie) when voting completes

### Current Implementation

The app implements a complete artist voting system:
- **Poll Setup**: Initiator chooses between predefined lists or custom options
- **Voting**: Participants vote anonymously for their favorite option
- **Results**: Real-time display with vote counts, percentages, and winner announcement
- **Data Flow**: Supabase Realtime Broadcast for real-time vote synchronization
- **Validation**: Input validation for custom options (min 2, max 50, no duplicates)

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

### Poll Configuration
- **Predefined Lists**: 3 ready-to-use lists stored in [src/data/predefinedOptions.json](src/data/predefinedOptions.json)
  - "Llista per defecte": 8 common Catalan names
  - "Equip de treball": 7 work roles
  - "Llista simple": 4 basic options (A, B, C, D)
- **Custom Lists**: Initiator can create custom options via textarea
  - One option per line
  - Validation: minimum 2, maximum 50 options
  - Duplicate detection

### Voting System
- **Anonymous Voting**: No registration required, participants vote immediately
- **Vote Submission**: Selected option broadcast via Supabase Realtime channel
- **Vote Confirmation**: Success message shows which option was voted for
- **Single Vote**: Each voter can only vote once (identified by anonymous voter ID)

### Results Display
- **Real-time Updates**: Main stage updates as votes come in
- **Vote Counts**: Number of votes for each option
- **Percentages**: Calculated and displayed for each option
- **Progress Bars**: Visual representation of vote distribution
- **Winner Announcement**: Crown emoji and highlight for winning option
- **Tie Detection**: Special message when multiple options are tied for first place

### Data Flow
```
Setup Side Panel (Initiator)
  ↓ (select/create poll options)
Start Activity
  ↓ (pass PollState with options in additionalData)
Main Stage (initialize with options, subscribe to Supabase channel)
  ↓
Activity Side Panel (all participants, connect to same Supabase channel)
  ↓ (vote for option, broadcast via Supabase Realtime)
Main Stage (receive votes via Supabase subscription, aggregate, display winner)
```

### Supabase Realtime Integration

The app uses Supabase Realtime Broadcast for vote synchronization:

- **Channel naming**: `poll-votes-${pollId}` - isolates different poll sessions
- **No database**: Uses Broadcast mode (ephemeral pub/sub, no persistence)
- **useVoteChannel hook** ([src/hooks/useVoteChannel.ts](src/hooks/useVoteChannel.ts)):
  - `sendVote(vote)` - Broadcasts vote to channel
  - `onVoteReceived` callback - Handles incoming votes
  - Automatic cleanup on component unmount

### Google Meet Add-ons SDK Key Methods

- `meet.addon.createAddonSession({ cloudProjectNumber })` - Initialize session
- `session.createMainStageClient()` - Get main stage client
- `session.createSidePanelClient()` - Get side panel client
- `mainStageClient.getActivityStartingState()` - Get initial data (includes poll options)
- `sidePanelClient.startActivity({ mainStageUrl, sidePanelUrl, additionalData })` - Start activity

### Future Enhancement: Tiebreaker Poll

If there's a tie in the votes:
1. Detect tied options after voting closes
2. Create a second poll with only the tied options
3. Run the tiebreaker poll with same flow
4. Display final winner

## Styling Notes

- Uses Tailwind CSS 4 with PostCSS
- Global styles in [src/app/globals.css](src/app/globals.css)
- Dark mode support via `prefers-color-scheme`
- CSS variables: `--background`, `--foreground`
- Font: Arial, Helvetica, sans-serif

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
- Test scenarios (predefined lists, custom lists, validation, etc.)
- Visual and functional testing checklists
- Common issues and solutions

## Documentation

- **README.md**: Quick start guide and project overview
- **CLAUDE.md** (this file): Complete architecture, features, and technical details
- **IMPLEMENTATION_STATUS.md**: Current implementation status and completion summary
- **TESTING_GUIDE.md**: Step-by-step testing instructions and test scenarios
- **POLL_OPTIONS_MODIFICATION_PLAN.md**: Implementation plan for poll options feature (completed)

### Archived Documentation
- **DEVELOPMENT_PLAN.md.archived**: Original development plan (superseded)
- **IMPLEMENTATION_SUMMARY.md.archived**: Old implementation summary (outdated)
