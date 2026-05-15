"use client";

import { useEffect, useState } from "react";
import { subscribeToParticipants } from "@/lib/participants";

type IdentityHeaderProps = {
  participantId: string;
  name: string;
  initialPoints: number;
  onChange: () => void;
};

export default function IdentityHeader({
  participantId,
  name,
  initialPoints,
  onChange,
}: IdentityHeaderProps) {
  const [points, setPoints] = useState(initialPoints);

  useEffect(() => {
    const channel = subscribeToParticipants((p) => {
      if (p.id === participantId) {
        setPoints(p.points);
      }
    });
    return () => {
      channel.unsubscribe();
    };
  }, [participantId]);

  return (
    <div className="flex items-center justify-between mb-6 px-4 py-3 hand-drawn-subtle border-3 border-crayon-purple/40 bg-card">
      <div className="flex items-center gap-2 font-body">
        <span className="text-xl">👤</span>
        <span className="font-heading text-base font-bold text-text-primary">{name}</span>
        <span className="text-xl ml-2">🏆</span>
        <span className="font-heading text-base font-bold text-crayon-purple">{points} punts</span>
      </div>
      <button
        type="button"
        onClick={onChange}
        className="font-body text-sm text-crayon-blue underline hover:text-crayon-purple"
        aria-label="Canviar d'identitat"
      >
        Canviar
      </button>
    </div>
  );
}
