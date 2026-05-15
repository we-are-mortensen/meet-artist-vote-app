"use client";

import type { Participant } from "@/types/poll.types";

type IdentityPickerProps = {
  participants: Participant[];
  onPick: (p: Participant) => void;
};

const crayonColors = [
  "border-crayon-blue",
  "border-crayon-pink",
  "border-crayon-green",
  "border-crayon-purple",
  "border-crayon-orange",
  "border-crayon-yellow",
  "border-crayon-red",
];

export default function IdentityPicker({ participants, onPick }: IdentityPickerProps) {
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

      <div className="space-y-3">
        {participants.map((p, index) => {
          const color = crayonColors[index % crayonColors.length];
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onPick(p)}
              className={`w-full flex items-center justify-between p-4 hand-drawn-subtle border-3 ${color} bg-card transition-all hover:scale-[1.01] hover:shadow-md`}
            >
              <span className="font-heading text-lg font-bold text-text-primary">{p.name}</span>
              <span className="font-body text-sm text-text-secondary">🏆 {p.points}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
