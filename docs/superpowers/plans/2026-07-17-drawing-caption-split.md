# Split Drawing Image (Host) from Caption (Artist) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the host upload only the round's drawing image while the artist adds an editable caption independently, merged into the same `poll_drawings` row.

**Architecture:** Split the single write-once `uploadPollDrawing` into two column-scoped upserts keyed on `poll_id` (`uploadPollDrawingImage`, `savePollCaption`). The host's `DrawingUpload` loses its caption field; a new `CaptionInput` renders for the artist after scoring. Both writes merge by `poll_id` regardless of order.

**Tech Stack:** Next.js 16 / React 19 / TypeScript, Supabase JS v2 (`upsert` with `onConflict`), Tailwind 4.

## Global Constraints

- All code/comments in English; all user-facing copy in **Catalan**.
- No test framework — verify each task with `npx tsc --noEmit` + `npm run build` + manual smoke (never propose jest/vitest).
- **Commits held per user convention:** implement every task first, then a single commit after the user's manual review — not one commit per task.
- Caption cap: **140 characters**.
- Crayon theme + `hand-drawn` styling consistent with existing components.

## Prerequisite (out-of-repo — user applies in Supabase Studio / dashboard repo)

`poll_drawings` is dashboard-owned. Before the app changes function, apply (reconciling policy names with the dashboard's conventions; verify existing INSERT policy/RLS first):

```sql
-- image_path nullable so a caption-first upsert can create the row.
alter table public.poll_drawings alter column image_path drop not null;
-- UNIQUE(poll_id) for `on conflict (poll_id)` — add only if not already present.
alter table public.poll_drawings add constraint poll_drawings_poll_id_key unique (poll_id);
-- anon UPDATE policy (INSERT already exists) — merge-duplicates needs both.
create policy "poll_drawings update" on public.poll_drawings
  for update using (true) with check (true);
```

---

## File Structure

- `src/lib/drawings.ts` — **modify**: replace `uploadPollDrawing` with `uploadPollDrawingImage` + `savePollCaption`.
- `src/components/DrawingUpload.tsx` — **modify**: image-only (drop caption input/state/arg).
- `src/components/CaptionInput.tsx` — **create**: artist caption editor.
- `src/app/activitysidepanel/page.tsx` — **modify**: render `CaptionInput` for the artist after `hasShownLeaderboard`.

---

### Task 1: Split the data layer

**Files:**
- Modify: `src/lib/drawings.ts`

**Interfaces:**
- Consumes: `supabase`, `DRAWINGS_BUCKET` from `src/lib/supabase.ts`.
- Produces:
  - `uploadPollDrawingImage(args: { pollId: string; file: File }): Promise<{ publicUrl: string }>`
  - `savePollCaption(args: { pollId: string; caption: string }): Promise<void>`

- [ ] **Step 1: Rewrite `src/lib/drawings.ts`** (replace the whole file body below the `"use client"` line)

```ts
"use client";

import { supabase, DRAWINGS_BUCKET } from "./supabase";

/**
 * Uploads a poll's drawing image to the shared `drawings` Storage bucket and
 * upserts the `image_path` onto the poll's `poll_drawings` row (keyed by
 * `poll_id`). Image and caption are written independently — this call touches
 * only `image_path`, so a caption written first is preserved by the merge.
 */
export async function uploadPollDrawingImage(args: {
  pollId: string;
  file: File;
}): Promise<{ publicUrl: string }> {
  const { pollId, file } = args;

  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const path = `${pollId}-${Date.now()}.${ext}`;

  const upload = await supabase.storage.from(DRAWINGS_BUCKET).upload(path, file);
  if (upload.error) {
    throw new Error(`Failed to upload drawing: ${upload.error.message}`);
  }

  const write = await supabase
    .from("poll_drawings")
    .upsert({ poll_id: pollId, image_path: path }, { onConflict: "poll_id" });
  if (write.error) {
    throw new Error(`Failed to record drawing: ${write.error.message}`);
  }

  const publicUrl = supabase.storage.from(DRAWINGS_BUCKET).getPublicUrl(path).data.publicUrl;
  return { publicUrl };
}

/**
 * Upserts the artist's caption onto the poll's `poll_drawings` row (keyed by
 * `poll_id`). Touches only `caption`, so the image is preserved by the merge;
 * a caption written before any image creates the row (image_path is nullable).
 * Repeatable — the artist may revise and resave.
 */
export async function savePollCaption(args: {
  pollId: string;
  caption: string;
}): Promise<void> {
  const write = await supabase
    .from("poll_drawings")
    .upsert(
      { poll_id: args.pollId, caption: args.caption.trim() || null },
      { onConflict: "poll_id" }
    );
  if (write.error) {
    throw new Error(`Failed to save caption: ${write.error.message}`);
  }
}
```

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit`. Expected: FAIL only in `src/components/DrawingUpload.tsx` (still importing the removed `uploadPollDrawing`). No errors from `drawings.ts` itself. (Fixed in Task 2.)

---

### Task 2: Image-only `DrawingUpload` (host)

**Files:**
- Modify: `src/components/DrawingUpload.tsx`

**Interfaces:**
- Consumes: `uploadPollDrawingImage` from Task 1.
- Produces: `<DrawingUpload pollId={string} />` (unchanged prop).

- [ ] **Step 1: Remove caption from `DrawingUpload.tsx`**

  - Change the import: `import { uploadPollDrawingImage } from "@/lib/drawings";`
  - Delete `const [caption, setCaption] = useState("");`
  - In `handleUpload`, change the call to:
    ```ts
    const { publicUrl } = await uploadPollDrawingImage({ pollId, file });
    ```
  - Delete the caption `<input>` block (the `type="text"` input bound to `caption`).
  - In the `uploadedUrl` done state, delete the caption line:
    ```tsx
    {caption.trim() && (
      <p className="mt-3 text-text-secondary italic">&ldquo;{caption.trim()}&rdquo;</p>
    )}
    ```

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit`. Expected: PASS (no more `caption`/`uploadPollDrawing` references).

---

### Task 3: `CaptionInput` component (artist)

**Files:**
- Create: `src/components/CaptionInput.tsx`

**Interfaces:**
- Consumes: `savePollCaption` from Task 1.
- Produces: `<CaptionInput pollId={string} />`.

- [ ] **Step 1: Create `src/components/CaptionInput.tsx`**

```tsx
"use client";

import { useState } from "react";
import { savePollCaption } from "@/lib/drawings";

const MAX_CAPTION = 140;

type Props = { pollId: string };

export default function CaptionInput({ pollId }: Props) {
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await savePollCaption({ pollId, caption });
      setSaved(true);
    } catch (err) {
      console.error("Error saving caption:", err);
      setError("Error desant la descripció. Torna-ho a provar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 p-5 bg-crayon-pink/10 border-3 border-crayon-pink hand-drawn">
      <p className="font-heading text-lg text-crayon-pink font-bold text-center mb-4">
        Descriu el teu dibuix ✏️
      </p>

      <input
        type="text"
        value={caption}
        maxLength={MAX_CAPTION}
        onChange={(e) => {
          setCaption(e.target.value);
          setSaved(false);
        }}
        disabled={busy}
        placeholder="Escriu una descripció (opcional)"
        className="w-full p-3 mb-3 hand-drawn border-3 border-crayon-pink bg-paper font-body"
      />

      <button
        type="button"
        onClick={handleSave}
        disabled={busy}
        className="w-full py-4 px-6 hand-drawn border-3 font-heading text-xl font-bold text-white bg-crayon-pink border-crayon-pink shadow-playful-pink transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:hover:scale-100"
      >
        {busy ? "Desant… ⏳" : "Desa ✏️"}
      </button>

      {saved && !error && (
        <p className="text-crayon-green font-bold mt-3 text-center">Desat ✓</p>
      )}
      {error && <p className="text-crayon-red font-bold mt-3 text-center">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Confirm `shadow-playful-pink` exists** — Run: `grep -n "shadow-playful-pink" src/app/globals.css`. If absent, use `shadow-playful` instead in the button `className`.

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit`. Expected: PASS.

---

### Task 4: Wire `CaptionInput` into the activity panel

**Files:**
- Modify: `src/app/activitysidepanel/page.tsx`

**Interfaces:**
- Consumes: `<CaptionInput pollId />` from Task 3.

- [ ] **Step 1: Import the component** — add near the other component imports:

```ts
import CaptionInput from "@/components/CaptionInput";
```

- [ ] **Step 2: Render it for the artist.** In the return, the outer content lives in `<div className="max-w-md mx-auto w-full">` after `<PollQuestion />` and the `isHost ? … : …` block. Immediately **after** that ternary block (still inside the `max-w-md` div), add:

```tsx
{!isHost &&
  identity.id === pollState.correctParticipantId &&
  hasShownLeaderboard && <CaptionInput pollId={pollState.pollId} />}
```

  This renders the caption editor for the artist (non-host) once the host has shown the leaderboard — the same trigger that reveals the host's image uploader — independent of whether the artist voted.

- [ ] **Step 3: Typecheck + build** — `npx tsc --noEmit` then `npm run build`. Expected: both PASS.

---

## Final verification (after all tasks)

1. `npx tsc --noEmit` — clean.
2. `npm run build` — passes (all routes build).
3. Apply the `poll_drawings` SQL in Studio first, then manual smoke (dev server, `NEXT_PUBLIC_DEBUG=1`):
   - **Host:** after "Mostrar puntuació", uploader shows **no caption field**; image upload works.
   - **Artist** (identity == `correct_participant_id`): after "Mostrar puntuació", the caption editor appears; typing + "Desa" shows "Desat ✓"; editing and resaving updates it.
   - **Both orders** (check `poll_drawings` in Studio): row ends with both `image_path` and `caption` whether caption or image was written first.
   - Companion dashboard still shows image + caption.

## Self-review notes

- Spec coverage: data-model prereq (§ prerequisite), data layer split (Task 1), host image-only (Task 2), artist caption editor incl. editable + 140 cap (Task 3), timing/gating on `hasShownLeaderboard` + artist identity (Task 4), verification (final). All spec sections mapped.
- Type consistency: `uploadPollDrawingImage` / `savePollCaption` names + signatures identical across Tasks 1–4.
- No placeholders: all code shown in full.
