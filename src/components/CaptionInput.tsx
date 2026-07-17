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
        className="w-full py-4 px-6 hand-drawn border-3 font-heading text-xl font-bold text-white bg-crayon-pink border-crayon-pink shadow-playful transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:hover:scale-100"
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
