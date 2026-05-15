type PollQuestionProps = {
  subtitle?: string;
};

export default function PollQuestion({ subtitle }: PollQuestionProps) {
  return (
    <div className="poll-question mb-8 text-center">
      <h1 className="font-heading text-3xl md:text-4xl font-bold text-crayon-purple mb-3 underline-crayon">
        Qui és l&apos;artista d&apos;avui?
      </h1>
      {subtitle && (
        <p className="font-body text-base md:text-lg text-text-secondary">{subtitle}</p>
      )}
    </div>
  );
}
