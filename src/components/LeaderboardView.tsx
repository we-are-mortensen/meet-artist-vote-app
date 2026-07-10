"use client";

import { useEffect, useRef } from "react";
import type { Participant } from "@/types/poll.types";

type LeaderboardViewProps = {
  participants: Participant[];
  deltasByParticipantId: Record<string, number>;
  /** Guess accuracy (0–1) per participant, used to break point ties. */
  accuracyByParticipantId?: Record<string, number>;
};

const rowColors = [
  "border-crayon-yellow",
  "border-crayon-blue",
  "border-crayon-pink",
  "border-crayon-green",
  "border-crayon-purple",
  "border-crayon-orange",
  "border-crayon-red",
];

export default function LeaderboardView({
  participants,
  deltasByParticipantId,
  accuracyByParticipantId = {},
}: LeaderboardViewProps) {
  // Rank by points desc; break ties by guess accuracy desc (matches the dashboard).
  const sorted = [...participants].sort(
    (a, b) =>
      b.points - a.points ||
      (accuracyByParticipantId[b.id] ?? 0) - (accuracyByParticipantId[a.id] ?? 0)
  );
  const badgeRefs = useRef<Record<string, HTMLSpanElement | null>>({});

  // Animate +N badges into view on mount.
  useEffect(() => {
    Object.values(badgeRefs.current).forEach((el) => {
      if (!el) return;
      el.animate(
        [
          { transform: "translateY(-10px) scale(0.7)", opacity: 0 },
          { transform: "translateY(0) scale(1)", opacity: 1 },
        ],
        { duration: 600, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)", fill: "forwards" }
      );
    });
  }, []);

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="text-center mb-8">
        <div className="flex justify-center gap-2 mb-3">
          <span className="text-5xl">🏆</span>
        </div>
        <h1 className="font-heading text-4xl md:text-5xl font-bold text-crayon-purple">
          Puntuació
        </h1>
      </div>

      <ol className="space-y-3">
        {sorted.map((p, index) => {
          const delta = deltasByParticipantId[p.id] ?? 0;
          const color = rowColors[index % rowColors.length];
          return (
            <li
              key={p.id}
              className={`flex items-center justify-between p-4 hand-drawn-subtle border-3 ${color} bg-card`}
            >
              <div className="flex items-center gap-4">
                <span className="font-heading text-2xl font-bold text-text-secondary w-8">
                  {index + 1}
                </span>
                <span className="font-heading text-xl font-bold text-text-primary">
                  {p.name}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {delta > 0 && (
                  <span
                    ref={(el) => {
                      badgeRefs.current[p.id] = el;
                    }}
                    className="inline-block font-heading text-base font-bold text-white bg-crayon-green px-3 py-1 hand-drawn-subtle"
                  >
                    +{delta}
                  </span>
                )}
                <span className="font-heading text-2xl font-bold text-crayon-purple">
                  {p.points}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
