"use client";

import type { Participant, Vote } from "@/types/poll.types";

type VotingProgressProps = {
  participants: Participant[];
  votes: Vote[];
  correctParticipantId: string;
  artistVoted: boolean;
};

const remainingPillColors = [
  "border-crayon-blue text-crayon-blue bg-crayon-blue/10",
  "border-crayon-pink text-crayon-pink bg-crayon-pink/10",
  "border-crayon-green text-crayon-green bg-crayon-green/10",
  "border-crayon-purple text-crayon-purple bg-crayon-purple/10",
  "border-crayon-orange text-crayon-orange bg-crayon-orange/10",
  "border-crayon-red text-crayon-red bg-crayon-red/10",
];

export default function VotingProgress({
  participants,
  votes,
  correctParticipantId,
  artistVoted,
}: VotingProgressProps) {
  const votedIds = new Set(votes.map((v) => v.voterParticipantId));
  const remaining = participants.filter((p) => {
    if (votedIds.has(p.id)) return false;
    if (p.id === correctParticipantId && artistVoted) return false;
    return true;
  });

  return (
    <div className="min-h-screen max-w-6xl mx-auto px-4 py-12 flex flex-col">
      <h1 className="font-heading text-5xl md:text-6xl font-bold text-crayon-purple text-center mb-4">
        Qui és l&apos;artista d&apos;avui?
      </h1>
      <p className="font-body text-xl text-text-secondary text-center mb-12">
        Esperant els resultats...
      </p>

      <div className="flex-1 flex items-center justify-center">
        {remaining.length === 0 ? (
          <p className="font-heading text-4xl md:text-5xl font-bold text-crayon-green text-center">
            Tothom ha votat! 🎉
          </p>
        ) : (
          <div className="w-full">
            <p className="font-heading text-2xl font-bold text-text-secondary text-center mb-6">
              Falten per votar:
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              {remaining.map((p, index) => (
                <span
                  key={p.id}
                  className={`px-6 py-3 hand-drawn-subtle border-3 font-heading text-2xl md:text-3xl font-bold ${
                    remainingPillColors[index % remainingPillColors.length]
                  }`}
                >
                  {p.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-12 flex justify-center">
        <div className="flex space-x-3">
          <div className="h-4 w-4 bg-crayon-pink rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
          <div className="h-4 w-4 bg-crayon-blue rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
          <div className="h-4 w-4 bg-crayon-yellow rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
          <div className="h-4 w-4 bg-crayon-green rounded-full animate-bounce" style={{ animationDelay: "450ms" }}></div>
          <div className="h-4 w-4 bg-crayon-purple rounded-full animate-bounce" style={{ animationDelay: "600ms" }}></div>
        </div>
      </div>
    </div>
  );
}
