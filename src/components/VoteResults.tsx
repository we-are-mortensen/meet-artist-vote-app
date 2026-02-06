/**
 * Displays voting results on the main stage
 * Shows vote counts, percentages, and visual bars for each poll option
 */

import type { VoteResults as VoteResultsType } from "../types/poll.types";

type VoteResultsProps = {
  /** Complete voting results to display */
  results: VoteResultsType;
  /** Whether voting is still in progress */
  votingInProgress?: boolean;
  /** ID of the correct answer option, as designated by the host */
  correctOptionId: string;
};

// Array of crayon colors to cycle through for result bars
const crayonColors = [
  { bg: "bg-crayon-blue", border: "border-crayon-blue", text: "text-crayon-blue" },
  { bg: "bg-crayon-pink", border: "border-crayon-pink", text: "text-crayon-pink" },
  { bg: "bg-crayon-green", border: "border-crayon-green", text: "text-crayon-green" },
  { bg: "bg-crayon-purple", border: "border-crayon-purple", text: "text-crayon-purple" },
  { bg: "bg-crayon-orange", border: "border-crayon-orange", text: "text-crayon-orange" },
  { bg: "bg-crayon-red", border: "border-crayon-red", text: "text-crayon-red" },
];

export default function VoteResults({ results, votingInProgress = true, correctOptionId }: VoteResultsProps) {
  const { results: optionResults, totalVotes } = results;

  // Find the correct answer and separate it from the rest
  const correctResult = optionResults.find((r) => r.optionId === correctOptionId);
  const otherResults = optionResults.filter((r) => r.optionId !== correctOptionId);

  if (totalVotes === 0) {
    return (
      <div className="vote-results-empty text-center py-12">
        <div className="mb-4 flex justify-center gap-2">
          <span className="text-5xl">📋</span>
        </div>
        <h2 className="font-heading text-3xl font-bold text-text-secondary mb-3">Esperant vots...</h2>
        <p className="font-body text-lg text-text-secondary">Els resultats es mostraran aquí quan els participants comencin a votar</p>
        {/* Waiting animation */}
        <div className="mt-6 flex justify-center">
          <div className="flex space-x-2">
            <div className="h-3 w-3 bg-crayon-pink rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
            <div className="h-3 w-3 bg-crayon-blue rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
            <div className="h-3 w-3 bg-crayon-yellow rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="vote-results max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="results-header text-center mb-8">
        <h1 className="font-heading text-4xl md:text-5xl font-bold text-crayon-purple mb-3">Resultats de la Votació</h1>
        <p className="font-body text-xl text-text-secondary">
          {totalVotes} {totalVotes === 1 ? "vot rebut" : "vots rebuts"}
        </p>
        {votingInProgress && (
          <div className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-crayon-blue/10 text-crayon-blue font-body font-semibold hand-drawn-subtle border-2 border-crayon-blue">
            <span className="inline-block animate-spin h-4 w-4 border-2 border-crayon-blue/30 border-t-crayon-blue rounded-full"></span>
            Votació en curs...
          </div>
        )}
      </div>

      {/* Correct answer hero card */}
      {!votingInProgress && correctResult && (
        <div className="correct-answer-hero bg-crayon-yellow/20 border-4 border-crayon-yellow hand-drawn p-8 mb-8 text-center shadow-playful-yellow">
          <div className="mb-4 flex justify-center gap-2">
            <span className="text-4xl animate-bounce" style={{ animationDelay: "0ms" }}>
              🌟
            </span>
            <span className="text-5xl animate-bounce" style={{ animationDelay: "100ms" }}>
              🎨
            </span>
            <span className="text-4xl animate-bounce" style={{ animationDelay: "200ms" }}>
              🌟
            </span>
          </div>
          <h2 className="font-heading text-3xl md:text-4xl font-bold text-crayon-yellow mb-2" style={{ textShadow: "2px 2px 0 rgba(0,0,0,0.1)" }}>
            L&apos;artista d&apos;avui és:
          </h2>
          <p className="font-heading text-4xl md:text-5xl font-bold text-crayon-purple mb-3">{correctResult.optionName}</p>
          <p className="font-body text-lg text-text-primary">
            {correctResult.voteCount} {correctResult.voteCount === 1 ? "vot" : "vots"} ({correctResult.percentage.toFixed(1)}%)
          </p>
        </div>
      )}

      {/* Other results list (sorted by vote count, excluding correct answer) */}
      {!votingInProgress && otherResults.length > 0 && (
        <div className="results-list space-y-4">
          {otherResults.map((result, index) => {
            const colorScheme = crayonColors[index % crayonColors.length];

            return (
              <div
                key={result.optionId}
                className={`result-item p-5 hand-drawn-subtle border-3 transition-all bg-card ${colorScheme.border}`}
              >
                {/* Option info */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className={`font-heading text-2xl font-bold ${colorScheme.text}`}>
                      #{index + 1}
                    </span>
                    <span className="font-heading text-xl font-bold text-text-primary">{result.optionName}</span>
                  </div>
                  <div className="text-right">
                    <div className={`font-heading text-3xl font-bold ${colorScheme.text}`}>
                      {result.voteCount}
                    </div>
                    <div className="font-body text-sm text-text-secondary">{result.percentage.toFixed(1)}%</div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-text-secondary/20 rounded-full h-4 overflow-hidden hand-drawn-subtle">
                  <div
                    className={`h-full transition-all duration-700 ${colorScheme.bg}`}
                    style={{ width: `${result.percentage}%` }}
                    aria-label={`${result.percentage.toFixed(1)}% dels vots`}
                  ></div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
