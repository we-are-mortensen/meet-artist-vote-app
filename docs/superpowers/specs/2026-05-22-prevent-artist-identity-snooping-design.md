# Prevent artist-identity snooping via indistinguishable voting UI

**Date:** 2026-05-22
**Status:** Approved for implementation

## Problem

Identity is self-selected from a shared list. Anyone can pick any participant. The participant who matches `polls.correct_participant_id` sees a distinct "you are the artist" waiting screen (`ArtistWaitingView`). That makes it trivial to discover today's artist:

1. Open the activity panel, pick a participant.
2. If you see the waiting screen, that's the artist — note the name.
3. Click "change identity," pick your real self, then vote correctly.

The voter walks the participant list until the UI tells them who the artist is. There's no defense because the giveaway is purely client-rendered.

## Goals

- An observer walking through every identity cannot distinguish the artist's screen from anyone else's at any point before reveal.
- Reduce the casual temptation to "click around" the identity picker by making it visually distinct from the voting list.
- No new infrastructure (no OAuth, no DB columns, no third-party cookies).

## Non-goals

- Real anti-impersonation. Two humans sharing a browser, or one human pretending to be another, is out of scope. The Meet Add-ons Web SDK does not expose the participant's Google identity to the iframe (`MeetingInfo` returns only `meetingId` and `meetingCode`), so binding to Google identity would require a separate OAuth flow — deferred until the threat model justifies it.
- Changes to the scoring rules or DB schema.

## Design

### Fix A — Artist sees the same voting UI as everyone else

The artist's view in `activitysidepanel` becomes byte-for-byte indistinguishable from a regular voter's:

- Same `PollQuestion`, same `OptionList`, same `VoteButton`, same post-submit "Has votat per X" confirmation card.
- When the artist clicks submit, the handler short-circuits: it updates local UI state (`hasVoted`, `votedForName`) so the confirmation renders, but skips the `sendVote` broadcast **and** skips the Supabase upsert. No row is written to `votes`, no `VOTE_CAST` event fires on the channel.
- The host controls (`Revelar resultats`, `Mostrar puntuació`) are gated on `isHost`, not on `isArtist`, so they continue to appear after the fake submit if the artist also happens to be the host. (Note: per CLAUDE.md, the host should not pick themselves as the artist, but the code does not enforce this.)

`ArtistWaitingView` becomes unused and is deleted along with its import.

### Fix C — Identity picker as dropdown

`IdentityPicker` switches from a vertical radio list to a single native `<select>` dropdown with a placeholder option and a confirm button. The public contract (`onPick(participant)`) is unchanged.

This makes the identity-selection step visually distinct from the voting radio list, reducing both confusion ("am I voting or picking myself?") and the casual click-through temptation that enabled the snooping exploit.

## Data flow

**Non-artist voter:** unchanged.

**Artist:** click submit → local state flips to `hasVoted` → confirmation card renders → no network call, no broadcast, no DB write.

**Mainstage:** unaffected. Live vote count is correct (one fewer than the participant count, which is also what it would be if `ArtistWaitingView` were still in place).

**Scoring RPC:** unaffected. `score_poll` reads `polls.correct_participant_id` for the artist-side point award, and the artist row simply isn't in `votes`, so no special-casing is needed.

**Results view:** unaffected. The "Qui ho ha encertat" list is derived from `votes` joined against `correct_participant_id`, so the artist never appears there.

## Edge cases

- **Artist changes identity mid-round → becomes a regular voter.** Their vote goes through normally. `onChangeIdentity` already resets `hasVoted` / `selectedOptionId`.
- **Voter changes identity mid-round → becomes the artist.** Their previously-cast real vote stays in the DB (it was a real choice at the time). UI resets, they fake-submit as the artist, server state is unchanged. From outside, indistinguishable.
- **Late joiner who is the artist.** Picker first, then voting UI, then fake submit. Same as everyone else.
- **Reveal arrives while the artist is mid-flow.** The existing `hasRevealed` branch in `activitysidepanel` renders the closed-state message; this is identical for artist and non-artist.

## What is intentionally NOT changed

- No DB schema changes.
- No changes to `score_poll` or any other RPC.
- No changes to the mainstage views.
- No enforcement that the host cannot pick themselves as artist (already a documented convention in CLAUDE.md).

## Files affected

- `src/app/activitysidepanel/page.tsx` — remove the `isArtist` rendering branch, short-circuit `handleVoteSubmit` for the artist, drop the `ArtistWaitingView` import.
- `src/components/IdentityPicker.tsx` — replace radio rendering with a `<select>` + confirm button.
- `src/components/ArtistWaitingView.tsx` — delete.
- `CLAUDE.md` — update the "Activity Side Panel" and "Voting System" sections so the docs match the new flow (the artist no longer sees a distinct waiting screen).
