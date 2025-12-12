/**
 * Button component for submitting votes
 * Displays "Enviar vot" (Send vote) in Catalan
 */

type VoteButtonProps = {
  /** Click handler for vote submission */
  onClick: () => void;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Whether the button is in loading/submitting state */
  loading?: boolean;
};

export default function VoteButton({
  onClick,
  disabled = false,
  loading = false,
}: VoteButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      aria-label="Enviar el meu vot"
      className={`
        vote-button w-full py-4 px-6 hand-drawn border-3
        font-heading text-xl font-bold text-white
        transition-all duration-200
        ${
          disabled || loading
            ? 'bg-text-secondary/40 border-text-secondary/40 cursor-not-allowed'
            : 'bg-crayon-blue border-crayon-blue shadow-playful hover:scale-[1.02] hover:rotate-1 active:scale-[0.98] active:rotate-0'
        }
        flex items-center justify-center gap-3
      `}
    >
      {loading ? (
        <>
          <span className="inline-block animate-spin rounded-full h-6 w-6 border-3 border-white/30 border-t-white"></span>
          <span>Enviant vot...</span>
        </>
      ) : (
        <>
          <span className="text-2xl">🎨</span>
          <span>Enviar vot</span>
        </>
      )}
    </button>
  );
}
