/**
 * Displays voting results on the main stage
 * Shows vote counts, percentages, and visual bars for each poll option
 */

import type { VoteResults as VoteResultsType } from '../types/poll.types';

type VoteResultsProps = {
  /** Complete voting results to display */
  results: VoteResultsType;
  /** Whether voting is still in progress */
  votingInProgress?: boolean;
};

export default function VoteResults({
  results,
  votingInProgress = true,
}: VoteResultsProps) {
  const { results: optionResults, totalVotes, hasTie, winner } = results;

  if (totalVotes === 0) {
    return (
      <div className="vote-results-empty text-center py-12">
        <div className="mb-4">
          <svg
            className="h-20 w-20 text-gray-400 mx-auto"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-600 dark:text-gray-400 mb-2">
          Esperant vots...
        </h2>
        <p className="text-gray-500 dark:text-gray-500">
          Els resultats es mostraran aquí quan els participants comencin a votar
        </p>
      </div>
    );
  }

  return (
    <div className="vote-results max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="results-header text-center mb-8">
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          Resultats de la Votació
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          {totalVotes} {totalVotes === 1 ? 'vot rebut' : 'vots rebuts'}
        </p>
        {votingInProgress && (
          <p className="text-sm text-blue-600 dark:text-blue-400 mt-2">
            Votació en curs...
          </p>
        )}
      </div>

      {/* Winner announcement (if voting complete and no tie) */}
      {!votingInProgress && winner && !hasTie && (
        <div className="winner-announcement bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-500 rounded-lg p-6 mb-8 text-center">
          <div className="mb-3">
            <svg
              className="h-16 w-16 text-yellow-500 mx-auto"
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-yellow-800 dark:text-yellow-200 mb-1">
            Guanyador: {winner.optionName}
          </h2>
          <p className="text-yellow-700 dark:text-yellow-300">
            {winner.voteCount} {winner.voteCount === 1 ? 'vot' : 'vots'} ({winner.percentage.toFixed(1)}%)
          </p>
        </div>
      )}

      {/* Tie announcement */}
      {!votingInProgress && hasTie && (
        <div className="tie-announcement bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-500 rounded-lg p-6 mb-8 text-center">
          <h2 className="text-2xl font-bold text-orange-800 dark:text-orange-200 mb-2">
            Empat!
          </h2>
          <p className="text-orange-700 dark:text-orange-300">
            Hi ha diverses opcions empatades a la primera posició
          </p>
        </div>
      )}

      {/* Results list */}
      <div className="results-list space-y-4">
        {optionResults.map((result, index) => {
          const isWinner = !hasTie && result.optionId === winner?.optionId;
          const isTied = hasTie && result.voteCount === optionResults[0].voteCount && result.voteCount > 0;

          return (
            <div
              key={result.optionId}
              className={`
                result-item p-4 rounded-lg border-2 transition-all
                ${
                  isWinner
                    ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20'
                    : isTied
                    ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                }
              `}
            >
              {/* Option info */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold text-gray-400 dark:text-gray-600">
                    #{index + 1}
                  </span>
                  <span className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                    {result.optionName}
                  </span>
                  {isWinner && (
                    <span className="text-yellow-500 text-2xl" aria-label="Guanyador">
                      👑
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {result.voteCount}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {result.percentage.toFixed(1)}%
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    isWinner
                      ? 'bg-yellow-500'
                      : isTied
                      ? 'bg-orange-500'
                      : 'bg-blue-500'
                  }`}
                  style={{ width: `${result.percentage}%` }}
                  aria-label={`${result.percentage.toFixed(1)}% dels vots`}
                ></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
