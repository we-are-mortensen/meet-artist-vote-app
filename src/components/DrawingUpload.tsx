"use client";

import { useState } from "react";
import { uploadPollDrawingImage } from "@/lib/drawings";

const MAX_BYTES = 10 * 1024 * 1024; // ~10 MB — phone photos are large; iframe upload is slow.

type Props = { pollId: string };

export default function DrawingUpload({ pollId }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
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
      const { publicUrl } = await uploadPollDrawingImage({ pollId, file });
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
