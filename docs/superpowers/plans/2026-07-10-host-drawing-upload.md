# Host Drawing Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the poll host attach the round's drawing image (+ optional caption) to the poll from the activity side panel, after the final leaderboard step.

**Architecture:** Client-only addition to the artist-vote Meet add-on. A thin lib wrapper (`drawings.ts`) performs the Supabase Storage upload + `poll_drawings` insert; a themed `DrawingUpload` component drives the UI; the activity side panel renders it gated to `isHost && hasShownLeaderboard`. The `poll_drawings` table, `drawings` bucket, and RLS already exist in the shared Supabase project (created by the dashboard repo) — no DB work here.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Tailwind CSS 4, `@supabase/supabase-js`.

## Global Constraints

- All code and comments in **English**; all user-facing copy in **Catalan**.
- No automated test framework in this repo — verify each task with `npx tsc --noEmit` and (final task) `npm run build`, plus manual smoke. Do NOT add jest/vitest.
- No DB migration / RLS change in this repo — infra is shared and already exists.
- Crayon theme utility classes as used elsewhere in this app: `hand-drawn`, `border-3`, `shadow-playful-*`, `font-heading`, `bg-crayon-*`, `bg-paper`.
- Hold all commits until the user has reviewed the finished work (user preference): implement everything, then one commit after review — do NOT commit per task.

---

### Task 1: Storage bucket constant + upload lib

**Files:**
- Modify: `src/lib/supabase.ts`
- Create: `src/lib/drawings.ts`

**Interfaces:**
- Consumes: `supabase` client from `src/lib/supabase.ts`.
- Produces:
  - `DRAWINGS_BUCKET: string` (value `"drawings"`) exported from `src/lib/supabase.ts`.
  - `uploadPollDrawing(args: { pollId: string; file: File; caption: string }): Promise<{ publicUrl: string }>` from `src/lib/drawings.ts`.

- [ ] **Step 1: Add the bucket constant to `src/lib/supabase.ts`**

Append after the `export const supabase = createClient(...)` line:

```ts
/** Public Storage bucket that holds per-poll drawing images (shared with the dashboard app). */
export const DRAWINGS_BUCKET = "drawings";
```

- [ ] **Step 2: Create `src/lib/drawings.ts`**

```ts
"use client";

import { supabase, DRAWINGS_BUCKET } from "./supabase";

/**
 * Uploads a poll's drawing image to the shared `drawings` Storage bucket and
 * records it in `poll_drawings`. The table/bucket/RLS are owned by the Artist
 * Vote Dashboard repo; this add-on only inserts (drawings are write-once — there
 * is no update policy, so a second upload for the same poll fails by design).
 */
export async function uploadPollDrawing(args: {
  pollId: string;
  file: File;
  caption: string;
}): Promise<{ publicUrl: string }> {
  const { pollId, file, caption } = args;

  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const path = `${pollId}-${Date.now()}.${ext}`;

  const upload = await supabase.storage.from(DRAWINGS_BUCKET).upload(path, file);
  if (upload.error) {
    throw new Error(`Failed to upload drawing: ${upload.error.message}`);
  }

  const insert = await supabase.from("poll_drawings").insert({
    poll_id: pollId,
    image_path: path,
    caption: caption.trim() || null,
  });
  if (insert.error) {
    throw new Error(`Failed to record drawing: ${insert.error.message}`);
  }

  const publicUrl = supabase.storage.from(DRAWINGS_BUCKET).getPublicUrl(path).data.publicUrl;
  return { publicUrl };
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

---

### Task 2: DrawingUpload component + activity side panel wiring

**Files:**
- Create: `src/components/DrawingUpload.tsx`
- Modify: `src/app/activitysidepanel/page.tsx`

**Interfaces:**
- Consumes: `uploadPollDrawing` from `src/lib/drawings.ts`.
- Produces: `DrawingUpload` default export, props `{ pollId: string }`.

- [ ] **Step 1: Create `src/components/DrawingUpload.tsx`**

```tsx
"use client";

import { useState } from "react";
import { uploadPollDrawing } from "@/lib/drawings";

const MAX_BYTES = 10 * 1024 * 1024; // ~10 MB — phone photos are large; iframe upload is slow.

type Props = { pollId: string };

export default function DrawingUpload({ pollId }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null;
    setError(null);

    if (picked && !picked.type.startsWith("image/")) {
      setError("El fitxer ha de ser una imatge.");
      return;
    }
    if (picked && picked.size > MAX_BYTES) {
      setError("La imatge és massa gran (màxim 10 MB).");
      return;
    }

    setFile(picked);
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return picked ? URL.createObjectURL(picked) : null;
    });
  }

  async function handleUpload() {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { publicUrl } = await uploadPollDrawing({ pollId, file, caption });
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setFile(null);
      setUploadedUrl(publicUrl);
    } catch (err) {
      console.error("Error uploading drawing:", err);
      setError("Error pujant el dibuix. Torna-ho a provar.");
    } finally {
      setBusy(false);
    }
  }

  // Done: the drawing has been uploaded.
  if (uploadedUrl) {
    return (
      <div className="mt-6 p-5 bg-crayon-green/10 border-3 border-crayon-green hand-drawn text-center">
        <p className="font-heading text-lg text-crayon-green font-bold mb-3">
          Dibuix pujat! 🎉
        </p>
        <div className="bg-paper hand-drawn overflow-hidden">
          <img src={uploadedUrl} alt="Dibuix" className="w-full h-auto object-contain" />
        </div>
        {caption.trim() && (
          <p className="mt-3 text-text-secondary italic">&ldquo;{caption.trim()}&rdquo;</p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-6 p-5 bg-crayon-blue/10 border-3 border-crayon-blue hand-drawn">
      <p className="font-heading text-lg text-crayon-blue font-bold text-center mb-4">
        Puja el dibuix d&rsquo;avui 🖼️
      </p>

      <div className="aspect-video bg-paper hand-drawn overflow-hidden flex items-center justify-center mb-4">
        {previewUrl ? (
          <img src={previewUrl} alt="Vista prèvia" className="w-full h-full object-contain" />
        ) : (
          <span className="text-6xl">🖼️</span>
        )}
      </div>

      <input
        type="text"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        disabled={busy}
        placeholder="Descripció del dibuix (opcional)"
        className="w-full p-3 mb-3 hand-drawn border-3 border-crayon-blue bg-paper font-body"
      />

      <label className="block mb-4">
        <span className="font-heading font-bold">Tria un dibuix 🖼️</span>
        <input
          type="file"
          accept="image/*"
          onChange={onPick}
          disabled={busy}
          className="block mt-2 w-full text-sm"
        />
      </label>

      <button
        type="button"
        onClick={handleUpload}
        disabled={busy || !file}
        className="w-full py-4 px-6 hand-drawn border-3 font-heading text-xl font-bold text-white bg-crayon-green border-crayon-green shadow-playful-green transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:hover:scale-100"
      >
        {busy ? "Pujant… ⏳" : "Pujar dibuix ⬆️"}
      </button>

      {error && <p className="text-crayon-red font-bold mt-3 text-center">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Wire it into `src/app/activitysidepanel/page.tsx`**

Add the import alongside the other component imports (after the `VoteButton` import near line 15):

```tsx
import DrawingUpload from "@/components/DrawingUpload";
```

Then, inside the `hasVoted` branch, replace the existing `hasRevealed` confirmation block:

```tsx
            {hasRevealed && (
              <div className="mt-6 p-5 bg-crayon-purple/10 border-3 border-crayon-purple hand-drawn text-center">
                <p className="font-heading text-lg text-crayon-purple font-bold">
                  Els resultats es mostren a la pantalla principal
                </p>
              </div>
            )}
```

with the same block plus the host-only upload underneath it:

```tsx
            {hasRevealed && (
              <div className="mt-6 p-5 bg-crayon-purple/10 border-3 border-crayon-purple hand-drawn text-center">
                <p className="font-heading text-lg text-crayon-purple font-bold">
                  Els resultats es mostren a la pantalla principal
                </p>
              </div>
            )}

            {isHost && hasShownLeaderboard && <DrawingUpload pollId={pollState.pollId} />}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Production build**

Run: `npm run build`
Expected: build succeeds with no type/lint errors.

- [ ] **Step 5: Manual smoke (host flow)**

As host, run a full round to the leaderboard (`Mostrar puntuació`). Confirm:
- The upload UI appears **only** after the leaderboard step, and **only** for the host (a non-host identity in another tab never sees it, nor does the host before the final step).
- Picking a non-image or a >10 MB file shows the Catalan validation error and does not upload.
- Uploading a valid image (with and without a caption) shows the "Dibuix pujat!" confirmation with the image.
- The row appears in `poll_drawings` and the object in the `drawings` bucket (and the image shows up in the dashboard app).

---

## Notes

- Do not commit until the user reviews (see Global Constraints). After approval, a single commit, e.g.:
  `✨ feat: let the host upload the round's drawing after scoring`
