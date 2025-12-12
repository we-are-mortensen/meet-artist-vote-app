# Artist Vote - Google Meet Add-on

A Google Meet add-on for voting on "who is today's artist" ("Qui és l'artista d'avui?"). The poll initiator can choose between predefined lists or create custom options, participants vote anonymously, and results are displayed in real-time on the main stage.

## Features

- **Poll Configuration**: Choose from predefined team lists (Mortensen, Dev, Disseny) or create custom options (2-50 items)
- **Anonymous Voting**: No registration required - participants vote immediately
- **Real-time Results**: Live vote counts, percentages, and visual progress bars
- **Winner Detection**: Automatic winner announcement with crown emoji or tie detection
- **Playful Theme**: Colorful, childish styling inspired by children's coloring books
- **Catalan Interface**: All user-facing content in Catalan

## Technology Stack

- **Next.js 16.0.5** with App Router
- **React 19.2.0** with TypeScript 5
- **Tailwind CSS 4** with playful theme (Baloo 2 + Nunito fonts)
- **Google Meet Add-ons SDK** v1.2.0
- **Supabase Realtime** for vote synchronization

## Getting Started

### Prerequisites

- Node.js installed
- Google Meet Add-on registered in Google Workspace Marketplace
- Cloud Project Number: `315905898182`
- Supabase project with Realtime enabled

### Installation

```bash
npm install
```

### Development

```bash
# Local development with debug mode
export NEXT_PUBLIC_DEBUG=1
npm run dev
```

Open [https://localhost:3000](https://localhost:3000) to test locally.

### Production Build

```bash
npm run build
npm start
```

### Deployment

The app is deployed to GitHub Pages:
- Production URL: https://we-are-mortensen.github.io/meet-artist-vote-app

## Project Structure

```
/src
  /app                     # Next.js pages
    /sidepanel            # Poll configuration (host only)
    /activitysidepanel    # Voting interface (all participants)
    /mainstage            # Results display (shared view)
  /components             # Reusable UI components
    OptionList.tsx        # Poll options selector
    VoteResults.tsx       # Results visualization
    PollQuestion.tsx      # Question display
    VoteButton.tsx        # Submit button
    VoteConfirmation.tsx  # Post-vote confirmation
  /data
    predefinedOptions.json # Predefined poll lists (Mortensen team)
  /hooks
    useVoteChannel.ts     # Supabase Realtime hook
  /lib
    supabase.ts           # Supabase client
  /types
    poll.types.ts         # TypeScript definitions
  /utils
    voteCalculations.ts   # Vote logic and validation
```

## How to Use

### In Google Meet

1. **Start a Google Meet call**
2. **Share screen** with the add-on URL
3. **Configure poll** (as initiator):
   - Select predefined list (Mortensen, Dev, or Disseny), OR
   - Enter custom options (one per line)
4. **Start voting** - All participants see options immediately
5. **Vote** - Select option and submit
6. **View results** - Real-time display on main stage

### Predefined Lists

- **Mortensen**: Adri, Anita, Ana, Anto, Edwin, Ester, Maria, Marie, Naomí, Nika, Pau
- **Dev**: Adri, Edwin, Marie, Nika, Pau
- **Disseny**: Anita, Ana, Ester, Maria, Naomí

## Testing

See [TESTING_GUIDE.md](TESTING_GUIDE.md) for comprehensive testing instructions.

## Documentation

- **README.md** (this file): Quick start and overview
- **CLAUDE.md**: Complete architecture, features, and technical details
- **IMPLEMENTATION_STATUS.md**: Current status and completion summary
- **TESTING_GUIDE.md**: Testing procedures and scenarios

## Configuration

### Environment Variables

Create a `.env` file with:

```
NEXT_PUBLIC_DEBUG=1
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your-anon-key
```

- `NEXT_PUBLIC_DEBUG=1` - Enables localhost mode for development
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` - Supabase anonymous key

### Constants

See [src/shared/constants.ts](src/shared/constants.ts) for:
- Cloud Project Number
- URL endpoints
- Debug mode configuration

## Learn More

- [Google Meet Add-ons Documentation](https://developers.google.com/meet/add-ons)
- [Supabase Realtime Documentation](https://supabase.com/docs/guides/realtime)
- [Next.js Documentation](https://nextjs.org/docs)
- [Tailwind CSS](https://tailwindcss.com)

## License

This project was created for Google Meet Add-ons.
