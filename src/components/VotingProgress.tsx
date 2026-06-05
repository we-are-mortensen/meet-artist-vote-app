"use client";

import type { Participant, Vote } from "@/types/poll.types";

type VotingProgressProps = {
  voteCount: number;
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
  voteCount,
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
    <div className="max-w-4xl mx-auto text-center py-12">
      <div className="mb-8">
        <h1 className="font-heading text-5xl md:text-6xl font-bold text-crayon-purple mb-6">
          Qui és l&apos;artista d&apos;avui?
        </h1>

        <div className="mt-8 mb-6">
          <div className="inline-flex items-center justify-center w-40 h-40 hand-drawn border-4 border-crayon-blue bg-crayon-blue/10 shadow-playful">
            <span className="font-heading text-6xl font-bold text-crayon-blue">{voteCount}</span>
          </div>
        </div>

        <p className="font-heading text-3xl font-bold text-text-primary">
          {voteCount === 1 ? "vot rebut" : "vots rebuts"}
        </p>

        <p className="font-body text-xl text-text-secondary mt-4">Esperant els resultats...</p>
      </div>

      <div className="mt-8 flex justify-center gap-3">
        <span className="text-4xl animate-pulse">👀</span>
      </div>

      <div className="mt-6 flex justify-center">
        <div className="flex space-x-3">
          <div className="h-4 w-4 bg-crayon-pink rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
          <div className="h-4 w-4 bg-crayon-blue rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
          <div className="h-4 w-4 bg-crayon-yellow rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
          <div className="h-4 w-4 bg-crayon-green rounded-full animate-bounce" style={{ animationDelay: "450ms" }}></div>
          <div className="h-4 w-4 bg-crayon-purple rounded-full animate-bounce" style={{ animationDelay: "600ms" }}></div>
        </div>
      </div>

      <div className="mt-12 max-w-3xl mx-auto">
        {remaining.length === 0 ? (
          <p className="font-heading text-2xl font-bold text-crayon-green">
            Tothom ha votat! 🎉
          </p>
        ) : (
          <>
            <p className="font-heading text-xl font-bold text-text-secondary mb-4">
              Falten per votar:
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              {remaining.map((p, index) => (
                <span
                  key={p.id}
                  className={`px-4 py-2 hand-drawn-subtle border-3 font-heading text-lg font-bold ${
                    remainingPillColors[index % remainingPillColors.length]
                  }`}
                >
                  {p.name}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
