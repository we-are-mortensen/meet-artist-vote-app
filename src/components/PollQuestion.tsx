/**
 * Displays the poll question in Catalan
 * Question: "Who is today's artist?" (Qui és l'artista d'avui?)
 */

type PollQuestionProps = {
  /** Optional subtitle or additional description in Catalan */
  subtitle?: string;
  /** Optional round number for display (e.g., "Ronda 2" for tiebreakers) */
  round?: number;
};

export default function PollQuestion({
  subtitle,
  round = 1,
}: PollQuestionProps) {
  return (
    <div className="poll-question mb-8 text-center">
      {round > 1 && (
        <div className="inline-block px-4 py-1 mb-3 bg-crayon-orange/20 text-crayon-orange font-heading text-sm font-bold hand-drawn-subtle border-2 border-crayon-orange">
          Ronda {round} - Desempat
        </div>
      )}
      <h1 className="font-heading text-3xl md:text-4xl font-bold text-crayon-purple mb-3 underline-crayon">
        Qui és l&apos;artista d&apos;avui?
      </h1>
      {subtitle && (
        <p className="font-body text-base md:text-lg text-text-secondary">
          {subtitle}
        </p>
      )}
    </div>
  );
}
