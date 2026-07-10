# Host Drawing Upload — Design

**Date:** 2026-07-10
**Status:** Approved

## Summary

After the host finishes a round (the final "Mostrar puntuació" step that shows the
leaderboard), the host — and only the host — can attach the round's drawing image
(plus an optional caption) to the poll from the activity side panel. The image is
stored in Supabase and consumed by the separate Artist Vote Dashboard project.

This is an **optional** action: the host may skip it and close the panel with no
side effects.

## Context

The Artist Vote Dashboard project (`../artist-vote-dashboard`) already owns the
storage infrastructure for per-poll drawings:

- **`poll_drawings` table** — `poll_id` (PK, FK → `polls.id`), `image_path`, `caption`
  (nullable), `uploaded_at`. Created by the dashboard's migration
  `supabase/migrations/0001_poll_drawings.sql`.
- **`drawings` Storage bucket** — public read. Same migration.
- **RLS** — the dashboard's `0003_enable_rls.sql` grants anon `select` + `insert` on
  `poll_drawings` (no `update`/`delete`) and anon `insert` on non-`legacy/` objects in
  the `drawings` bucket. The absence of an update policy makes the drawing
  **write-once** at the database level.

Both apps share the same Supabase project and the same browser-side anon
(publishable) key, so this add-on can write to those objects with the anon client it
already uses. **No migration or DB change is needed in this repo.**

## Non-goals

- No new DB tables, migrations, or RLS changes in the artist-vote repo (infra is
  shared and already exists).
- No realtime broadcast or main-stage / participant reaction to the upload — the
  drawing is dashboard-facing only.
- No edit/replace flow — write-once is accepted (enforced by RLS).
- No pre-check for an existing drawing row (the host just finished this round, so it
  is effectively always fresh); a duplicate attempt simply surfaces the DB error.

## Components

### 1. `src/lib/supabase.ts` (edit)

Add and export a bucket-name constant so it is not a magic string:

```ts
export const DRAWINGS_BUCKET = "drawings";
```

### 2. `src/lib/drawings.ts` (new)

Wraps the Supabase calls, keeping them out of the component (matching how `polls.ts`,
`votes.ts`, and `scoring.ts` isolate DB access in this repo).

```ts
export async function uploadPollDrawing(args: {
  pollId: string;
  file: File;
  caption: string;
}): Promise<{ publicUrl: string }>;
```

Behavior:
1. Derive extension from the file name (fallback `png`).
2. Upload to `DRAWINGS_BUCKET` at path `${pollId}-${timestamp}.${ext}`.
3. Insert a `poll_drawings` row `{ poll_id, image_path, caption: caption.trim() || null }`.
   (Plain `insert`, not upsert — write-once; a conflict is a real error to surface.)
4. Return the public URL (`getPublicUrl`) for preview.

Throws a descriptive `Error` on any Supabase error (consistent with `polls.ts`).

### 3. `src/components/DrawingUpload.tsx` (new)

Presentational upload widget in the artist-vote crayon theme (`hand-drawn`,
`border-3`, `shadow-playful-*`, `font-heading`). All copy in **Catalan**.

Props: `{ pollId: string }`.

Local state machine:
- **pick** — file input (`accept="image/*"`) + optional caption text field
  (`Descripció del dibuix (opcional)`) + image preview once a file is chosen +
  "Pujar dibuix ⬆️" button (disabled until a file is picked).
- **busy** — "Pujant… ⏳", controls disabled.
- **done** — success confirmation showing the uploaded image (and caption if any).
- **error** — friendly Catalan message; user can retry.

**Client-side validation** before upload:
- Reject non-image files (`!file.type.startsWith("image/")`).
- Reject files larger than ~10 MB (phone photos are large; the Meet iframe upload is
  slow). Show a Catalan error instead of uploading.

Object-URL previews are revoked on replace/unmount to avoid leaks.

### 4. `src/app/activitysidepanel/page.tsx` (edit)

Render `<DrawingUpload pollId={pollState.pollId} />` **only when
`isHost && hasShownLeaderboard`**, placed directly below the existing
"Els resultats es mostren a la pantalla principal" confirmation block inside the
`hasVoted` branch. No other control flow changes.

## Data flow

```
Host finishes round (Mostrar puntuació → hasShownLeaderboard = true)
  ↓ (host only) DrawingUpload appears in the activity side panel
  ↓ host picks image (+ optional caption), presses "Pujar dibuix"
  ↓ client-side validate (image type, <=10MB)
  ↓ uploadPollDrawing():
      ↓ storage.upload(drawings, `${pollId}-${ts}.${ext}`, file)
      ↓ insert poll_drawings { poll_id, image_path, caption }
  ↓ success → show uploaded image; error → Catalan message + retry
Artist Vote Dashboard (separate app) later reads poll_drawings + bucket
```

## Error handling

- **Validation errors** (wrong type / too large) — caught before any network call,
  shown inline in Catalan, no upload attempted.
- **Storage/insert errors** — `uploadPollDrawing` throws; the component catches and
  shows the message. A write-once conflict (drawing already exists) manifests here as
  a normal error the host can read.
- The upload is optional and isolated: a failure never blocks closing the panel or
  affects scoring / other participants.

## Testing

This repo has no automated test framework (verify via typecheck + build + manual
smoke, per project convention):

1. `npx tsc --noEmit` — types clean.
2. `npm run build` — production build succeeds.
3. Manual smoke: as host, run a full round through to the leaderboard, confirm the
   upload UI appears only for the host and only after the final step, upload an image
   with and without a caption, and verify the row/object appear in Supabase (and in
   the dashboard). Confirm non-hosts and the pre-leaderboard states never show it.
