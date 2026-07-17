"use client";

import { supabase, DRAWINGS_BUCKET } from "./supabase";

/**
 * Uploads a poll's drawing image to the shared `drawings` Storage bucket and
 * upserts the `image_path` onto the poll's `poll_drawings` row (keyed by
 * `poll_id`). Image and caption are written independently — this call touches
 * only `image_path`, so a caption written first is preserved by the merge.
 * The table/bucket/RLS are owned by the Artist Vote Dashboard repo.
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
