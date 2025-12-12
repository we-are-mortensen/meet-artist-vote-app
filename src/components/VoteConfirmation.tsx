/**
 * Displays confirmation message after a vote has been successfully cast
 * Shows which option was voted for and waiting message
 */

type VoteConfirmationProps = {
  /** Name of the option that was voted for */
  votedForName: string;
};

export default function VoteConfirmation({ votedForName }: VoteConfirmationProps) {
  return (
    <div className="vote-confirmation bg-crayon-green/10 border-3 border-crayon-green hand-drawn p-6 text-center shadow-playful-green">
      {/* Success stars */}
      <div className="mb-4 flex justify-center gap-2">
        <span className="text-3xl animate-bounce" style={{ animationDelay: '0ms' }}>⭐</span>
        <span className="text-4xl animate-bounce" style={{ animationDelay: '100ms' }}>🎉</span>
        <span className="text-3xl animate-bounce" style={{ animationDelay: '200ms' }}>⭐</span>
      </div>

      {/* Success message */}
      <h2 className="font-heading text-2xl font-bold text-crayon-green mb-3">
        Vot enviat correctament!
      </h2>

      {/* Voted for message */}
      <p className="font-body text-lg text-text-primary mb-4">
        Has votat per: <span className="font-bold text-crayon-purple">{votedForName}</span>
      </p>

      {/* Waiting message */}
      <div className="pt-4 border-t-2 border-crayon-green/30">
        <p className="font-body text-base text-text-secondary">
          Esperant la resta de vots...
        </p>
        <p className="font-body text-sm text-text-secondary mt-2">
          Els resultats es mostraran a la pantalla principal
        </p>
      </div>

      {/* Loading animation - colorful dots */}
      <div className="mt-5 flex justify-center">
        <div className="flex space-x-2">
          <div className="h-3 w-3 bg-crayon-pink rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
          <div className="h-3 w-3 bg-crayon-blue rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
          <div className="h-3 w-3 bg-crayon-yellow rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          <div className="h-3 w-3 bg-crayon-green rounded-full animate-bounce" style={{ animationDelay: '450ms' }}></div>
        </div>
      </div>
    </div>
  );
}
