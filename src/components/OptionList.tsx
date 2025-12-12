/**
 * Displays a list of poll options as selectable choices for voting
 */

import type { PollOption } from '../types/poll.types';

type OptionListProps = {
  /** Array of poll options to display */
  options: PollOption[];
  /** ID of the currently selected option */
  selectedOptionId: string;
  /** Callback when an option is selected */
  onSelect: (optionId: string) => void;
  /** Whether the list is disabled (e.g., during submission) */
  disabled?: boolean;
  /** Whether to show loading state */
  loading?: boolean;
};

export default function OptionList({
  options,
  selectedOptionId,
  onSelect,
  disabled = false,
  loading = false,
}: OptionListProps) {
  if (loading) {
    return (
      <div className="option-list-loading text-center py-8">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-crayon-pink/30 border-t-crayon-pink"></div>
        <p className="mt-4 font-body text-text-secondary font-medium">
          Carregant opcions...
        </p>
      </div>
    );
  }

  if (options.length === 0) {
    return (
      <div className="option-list-empty text-center py-8">
        <p className="font-body text-text-secondary">
          No hi ha opcions disponibles
        </p>
      </div>
    );
  }

  // Array of crayon colors to cycle through for options
  const crayonColors = [
    { border: 'border-crayon-blue', bg: 'bg-crayon-blue/10', text: 'text-crayon-blue', ring: 'ring-crayon-blue' },
    { border: 'border-crayon-pink', bg: 'bg-crayon-pink/10', text: 'text-crayon-pink', ring: 'ring-crayon-pink' },
    { border: 'border-crayon-green', bg: 'bg-crayon-green/10', text: 'text-crayon-green', ring: 'ring-crayon-green' },
    { border: 'border-crayon-purple', bg: 'bg-crayon-purple/10', text: 'text-crayon-purple', ring: 'ring-crayon-purple' },
    { border: 'border-crayon-orange', bg: 'bg-crayon-orange/10', text: 'text-crayon-orange', ring: 'ring-crayon-orange' },
    { border: 'border-crayon-yellow', bg: 'bg-crayon-yellow/10', text: 'text-crayon-yellow', ring: 'ring-crayon-yellow' },
    { border: 'border-crayon-red', bg: 'bg-crayon-red/10', text: 'text-crayon-red', ring: 'ring-crayon-red' },
  ];

  return (
    <div className="option-list space-y-3">
      <p className="font-heading text-lg font-bold text-text-primary mb-4">
        Selecciona una opció:
      </p>
      {options.map((option, index) => {
        const isSelected = selectedOptionId === option.id;
        const colorScheme = crayonColors[index % crayonColors.length];

        return (
          <label
            key={option.id}
            className={`
              poll-option
              flex items-center p-4 hand-drawn-subtle border-3 cursor-pointer
              transition-all duration-200 bg-card
              ${
                isSelected
                  ? `${colorScheme.border} ${colorScheme.bg} shadow-lg scale-[1.02]`
                  : 'border-text-secondary/30 hover:border-crayon-blue/50'
              }
              ${
                disabled
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:scale-[1.01] hover:shadow-md'
              }
            `}
          >
            <div
              className={`
                w-6 h-6 rounded-full border-3 flex items-center justify-center
                transition-all duration-200
                ${
                  isSelected
                    ? `${colorScheme.border} ${colorScheme.bg}`
                    : 'border-text-secondary/40'
                }
              `}
            >
              {isSelected && (
                <div className={`w-3 h-3 rounded-full ${colorScheme.border.replace('border-', 'bg-')}`} />
              )}
            </div>
            <input
              type="radio"
              name="poll-option"
              value={option.id}
              checked={isSelected}
              onChange={() => onSelect(option.id)}
              disabled={disabled}
              className="sr-only"
              aria-label={`Votar per ${option.name}`}
            />
            <span
              className={`
                ml-4 font-body text-lg font-semibold
                ${isSelected ? colorScheme.text : 'text-text-primary'}
              `}
            >
              {option.name}
            </span>
          </label>
        );
      })}
    </div>
  );
}
