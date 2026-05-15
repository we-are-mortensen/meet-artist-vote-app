"use client";

import type { Participant, VoteResults as VoteResultsType } from "@/types/poll.types";

type ResultsViewProps = {
  results: VoteResultsType;
  artist: Participant;
};

const crayonColors = [
  { bg: "bg-crayon-blue",   border: "border-crayon-blue",   text: "text-crayon-blue" },
  { bg: "bg-crayon-pink",   border: "border-crayon-pink",   text: "text-crayon-pink" },
  { bg: "bg-crayon-green",  border: "border-crayon-green",  text: "text-crayon-green" },
  { bg: "bg-crayon-purple", border: "border-crayon-purple", text: "text-crayon-purple" },
  { bg: "bg-crayon-orange", border: "border-crayon-orange", text: "text-crayon-orange" },
  { bg: "bg-crayon-red",    border: "border-crayon-red",    text: "text-crayon-red" },
];

export default function ResultsView({ results, artist }: ResultsViewProps) {
  const { results: optionResults, totalVotes, correctGuessers } = results;
  const artistResult = optionResults.find((r) => r.participantId === artist.id);
  const otherResults = optionResults.filter((r) => r.participantId !== artist.id);

  if (totalVotes === 0) {
    return (
      <div className="text-center py-12">
        <h2 className="font-heading text-3xl font-bold text-text-secondary mb-3">Ningú no ha votat</h2>
        <p className="font-body text-lg text-text-secondary">
          L&apos;artista d&apos;avui era <strong>{artist.name}</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="text-center mb-8">
        <h1 className="font-heading text-4xl md:text-5xl font-bold text-crayon-purple mb-3">
          Resultats de la Votació
        </h1>
        <p className="font-body text-xl text-text-secondary">
          {totalVotes} {totalVotes === 1 ? "vot rebut" : "vots rebuts"}
        </p>
      </div>

      {/* Artist hero card */}
      <div className="bg-crayon-yellow/20 border-4 border-crayon-yellow hand-drawn p-8 mb-6 text-center shadow-playful-yellow">
        <div className="mb-4 flex justify-center gap-2">
          <span className="text-4xl animate-bounce" style={{ animationDelay: "0ms" }}>🌟</span>
          <span className="text-5xl animate-bounce" style={{ animationDelay: "100ms" }}>🎨</span>
          <span className="text-4xl animate-bounce" style={{ animationDelay: "200ms" }}>🌟</span>
        </div>
        <h2 className="font-heading text-3xl md:text-4xl font-bold text-crayon-yellow mb-2"
            style={{ textShadow: "2px 2px 0 rgba(0,0,0,0.1)" }}>
          L&apos;artista d&apos;avui és:
        </h2>
        <p className="font-heading text-4xl md:text-5xl font-bold text-crayon-purple mb-3">
          {artist.name}
        </p>
        {artistResult && (
          <p className="font-body text-lg text-text-primary">
            {artistResult.voteCount} {artistResult.voteCount === 1 ? "vot" : "vots"} ({artistResult.percentage.toFixed(1)}%)
          </p>
        )}
      </div>

      {/* Correct guessers highlight */}
      <div className="bg-crayon-green/15 border-3 border-crayon-green hand-drawn-subtle p-5 mb-8 text-center">
        <p className="font-heading text-lg font-bold text-crayon-green mb-2">
          {correctGuessers.length === 0
            ? "Ningú ho ha encertat 🙈"
            : "Qui ho ha encertat:"}
        </p>
        {correctGuessers.length > 0 && (
          <p className="font-body text-xl text-text-primary">
            {correctGuessers.map((g) => g.name).join(", ")}
          </p>
        )}
      </div>

      {/* Other (wrong-answer) aggregate breakdown */}
      {otherResults.length > 0 && (
        <div className="space-y-4">
          {otherResults.map((result, index) => {
            const color = crayonColors[index % crayonColors.length];
            return (
              <div key={result.participantId} className={`p-5 hand-drawn-subtle border-3 bg-card ${color.border}`}>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-heading text-xl font-bold text-text-primary">
                    {result.participantName}
                  </span>
                  <div className="text-right">
                    <div className={`font-heading text-3xl font-bold ${color.text}`}>
                      {result.voteCount}
                    </div>
                    <div className="font-body text-sm text-text-secondary">
                      {result.percentage.toFixed(1)}%
                    </div>
                  </div>
                </div>
                <div className="w-full bg-text-secondary/20 rounded-full h-4 overflow-hidden hand-drawn-subtle">
                  <div
                    className={`h-full transition-all duration-700 ${color.bg}`}
                    style={{ width: `${result.percentage}%` }}
                    aria-label={`${result.percentage.toFixed(1)}% dels vots`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
