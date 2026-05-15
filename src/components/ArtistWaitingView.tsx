"use client";

type ArtistWaitingViewProps = {
  name: string;
  hasRevealed: boolean;
};

export default function ArtistWaitingView({ name, hasRevealed }: ArtistWaitingViewProps) {
  return (
    <div className="text-center py-8">
      <div className="flex justify-center gap-2 mb-4">
        <span className="text-5xl animate-bounce" style={{ animationDelay: "0ms" }}>🎨</span>
        <span className="text-5xl animate-bounce" style={{ animationDelay: "100ms" }}>✨</span>
        <span className="text-5xl animate-bounce" style={{ animationDelay: "200ms" }}>🌟</span>
      </div>
      <h1 className="font-heading text-3xl font-bold text-crayon-purple mb-3">
        Avui l&apos;artista ets tu, {name}!
      </h1>
      <p className="font-body text-base text-text-secondary mb-2">
        No has de votar en aquesta ronda.
      </p>
      <p className="font-body text-base text-text-secondary">
        {hasRevealed
          ? "Els resultats s'estan mostrant a la pantalla principal."
          : "Espera mentre la resta vota."}
      </p>
    </div>
  );
}
