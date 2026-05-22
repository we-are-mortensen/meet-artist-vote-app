"use client";

import { useState } from "react";
import type { Participant } from "@/types/poll.types";

type IdentityPickerProps = {
  participants: Participant[];
  onPick: (p: Participant) => void;
};

export default function IdentityPicker({ participants, onPick }: IdentityPickerProps) {
  const [selectedId, setSelectedId] = useState("");

  function handleConfirm() {
    const chosen = participants.find((p) => p.id === selectedId);
    if (chosen) onPick(chosen);
  }

  const canConfirm = selectedId !== "";

  return (
    <div className="max-w-md mx-auto w-full">
      <div className="text-center mb-6">
        <div className="flex justify-center gap-2 mb-3">
          <span className="text-3xl">👋</span>
          <span className="text-3xl">🎨</span>
        </div>
        <h1 className="font-heading text-3xl font-bold text-crayon-purple mb-2">Qui ets?</h1>
        <p className="font-body text-base text-text-secondary">
          Selecciona el teu nom per començar a votar
        </p>
      </div>

      <div className="mb-6">
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full p-4 hand-drawn-subtle border-3 border-crayon-purple bg-card font-heading text-lg font-bold text-text-primary focus:outline-none focus:ring-2 focus:ring-crayon-purple"
          aria-label="Selecciona el teu nom"
        >
          <option value="" disabled>
            — Tria el teu nom —
          </option>
          {participants.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        onClick={handleConfirm}
        disabled={!canConfirm}
        className={`w-full py-4 px-6 hand-drawn border-3 font-heading text-xl font-bold text-white transition-all duration-200 flex items-center justify-center gap-3 ${
          canConfirm
            ? "bg-crayon-purple border-crayon-purple shadow-playful-purple hover:scale-[1.02] hover:rotate-1 active:scale-[0.98] active:rotate-0"
            : "bg-text-secondary/40 border-text-secondary/40 cursor-not-allowed"
        }`}
      >
        <span className="text-2xl">✅</span>
        Confirmar
      </button>
    </div>
  );
}
