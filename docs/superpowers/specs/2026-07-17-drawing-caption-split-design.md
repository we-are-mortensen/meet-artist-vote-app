# Split the drawing image (host) from its caption (artist)

**Date:** 2026-07-17
**Status:** Approved design, ready for implementation plan

## Context

Today, after scoring, the host uploads the round's drawing **and** types its
caption in one form (`DrawingUpload.tsx` → `uploadPollDrawing` →
single write-once INSERT into `poll_drawings`, see
`src/components/DrawingUpload.tsx`, `src/lib/drawings.ts`).

We want to separate authorship: the **host uploads only the image**, and the
**artist** (the participant whose identity matches
`polls.correct_participant_id`) gets their own text input to add a caption "if
they want." The caption is the artist describing their own drawing, so it should
come from them, not the host.

`poll_drawings`, its RLS, and the `drawings` Storage bucket are **owned by the
companion Artist Vote Dashboard repo** and managed manually in Supabase Studio.
Today the table is effectively write-once: one INSERT per poll, no UPDATE policy
(a second upload fails by design). The dashboard reads `poll_drawings.caption`
to display the caption, so the caption must ultimately land in that column.

## Decisions (confirmed with the user)

1. **Independent, any-order.** The host image upload and the artist caption are
   two independent actions submitted in any order, merged by `poll_id`.
2. **Caption stays in `poll_drawings`.** Extend the dashboard-owned table
   (nullable `image_path`, upsert on `poll_id`) rather than storing the caption
   elsewhere — keeps the dashboard's read path unchanged.
3. **Editable caption.** The artist can revise and resubmit; each save upserts
   over the previous caption.
4. **Timing.** The artist's caption input appears at the same moment the host
   gets the image uploader — after "Mostrar puntuació" (`hasShownLeaderboard`).

## Data model — `poll_drawings` (dashboard repo / Studio)

Because the caption may be written before the image exists, `poll_drawings`
must support a caption-first row and independent column updates. Applied in the
dashboard repo's migrations / Supabase Studio (this repo cannot reach it). The
policy names below should be reconciled with the dashboard's existing
conventions; verify the current INSERT policy and RLS state first.

```sql
-- 1. image_path nullable so a caption-first upsert can create the row.
alter table public.poll_drawings alter column image_path drop not null;

-- 2. UNIQUE(poll_id) so `on conflict (poll_id)` resolves. Likely already
--    present (today's "second upload fails" behavior); add only if missing.
alter table public.poll_drawings add constraint poll_drawings_poll_id_key unique (poll_id);

-- 3. anon UPDATE policy (INSERT already exists) — merge-duplicates upsert needs
--    both INSERT and UPDATE.
create policy "poll_drawings update" on public.poll_drawings
  for update using (true) with check (true);
```

Trust model is unchanged: anon holding the publishable key can already write
`polls`/`votes`; the caption joins that same client-trusted tier. RLS cannot
distinguish clients or restrict columns, so this does not "verify" that the
writer is really the artist — it is the same posture as the rest of the app.

Assumption: any other `poll_drawings` columns (`id`, `created_at`, …) have
defaults, so a partial upsert of just `{poll_id, image_path}` or
`{poll_id, caption}` inserts cleanly.

## Data layer — `src/lib/drawings.ts`

Replace `uploadPollDrawing({ pollId, file, caption })` with two column-scoped
upserts. PostgREST merge-duplicates only writes the columns present in the
payload, so each call preserves the other's field.

```ts
// Uploads the image to Storage and records/updates only image_path.
export async function uploadPollDrawingImage(args: { pollId: string; file: File }):
  Promise<{ publicUrl: string }> {
  // ... upload to DRAWINGS_BUCKET as `${pollId}-${Date.now()}.${ext}` ...
  // supabase.from("poll_drawings").upsert(
  //   { poll_id: pollId, image_path: path }, { onConflict: "poll_id" });
  // return { publicUrl };
}

// Writes/updates only the caption (trimmed, or null when cleared).
export async function savePollCaption(args: { pollId: string; caption: string }):
  Promise<void> {
  // supabase.from("poll_drawings").upsert(
  //   { poll_id: args.pollId, caption: args.caption.trim() || null },
  //   { onConflict: "poll_id" });
}
```

Image-first→caption and caption-first→image both converge to one row holding
both fields.

## UI

### `DrawingUpload.tsx` (host) — image only
Remove the caption `<input>`, the `caption` state, and the caption argument.
Keep the file picker, preview, size/type validation (`MAX_BYTES`, `image/*`),
the upload button, and the "Dibuix pujat! 🎉" done state (drop the caption line
in the done state). Call `uploadPollDrawingImage`.

### `CaptionInput.tsx` (artist) — new
- Props: `{ pollId: string }`.
- A text input (`maxLength` ~140) + "Desa" button → `savePollCaption`.
- Editable/resubmittable: input stays open; show a transient "Desat ✓"
  confirmation after each successful save; show an error on failure.
- Catalan copy, crayon styling consistent with `DrawingUpload`.

### `activitysidepanel/page.tsx`
- **Host branch:** unchanged — `DrawingUpload` after `hasShownLeaderboard`.
- **Voter view:** render `CaptionInput` when
  `identity.id === pollState.correctParticipantId && hasShownLeaderboard`,
  independent of the `hasVoted` / `hasRevealed` sub-branches, so it surfaces at
  the same moment the host gets the image uploader. Non-host clients already
  receive `hasShownLeaderboard` via the `SHOW_LEADERBOARD` broadcast
  (`useVoteChannel` → `handleShowLeaderboard`).

## Behavior / edge cases

- **Optional:** the artist can ignore the caption entirely.
- **Any order:** host image and artist caption upsert independently; the
  dashboard merges by `poll_id`.
- **Host-is-artist** (already discouraged): such a user is on the host branch,
  so they get the image uploader but no caption input. Acceptable given the
  existing "don't be the artist" guidance; documented, not specially handled.
- **Main stage untouched:** the caption surfaces via the dashboard (which reads
  `poll_drawings`), not the live main stage.

## Verification

No test framework (repo convention: typecheck + build + manual smoke).

1. `npx tsc --noEmit` — clean.
2. `npm run build` — passes.
3. Apply the `poll_drawings` SQL in Studio **first** (else upserts fail).
4. Manual smoke (dev server, `NEXT_PUBLIC_DEBUG=1`):
   - **Host:** after "Mostrar puntuació", the uploader shows **no caption
     field**; uploading the image works.
   - **Artist** (identity == `correct_participant_id`): after "Mostrar
     puntuació", the caption input appears; typing + "Desa" shows "Desat ✓";
     editing and resaving updates it.
   - **Both orders in Studio:** verify one `poll_drawings` row per poll ends up
     with both `image_path` and `caption` whether the caption or the image was
     written first.
   - Confirm the companion dashboard still displays image + caption for the poll.
