"use client";

import { useEffect, useState } from "react";
import { meet, MeetSidePanelClient } from "@googleworkspace/meet-addons/meet.addons";
import { ACTIVITY_SIDE_PANEL_URL, CLOUD_PROJECT_NUMBER, MAIN_STAGE_URL } from "@/shared/constants";
import { generatePollId } from "@/utils/voteCalculations";
import { listParticipants } from "@/lib/participants";
import { createPoll } from "@/lib/polls";
import type { Participant, PollState } from "@/types/poll.types";

export default function Page() {
  const [sidePanelClient, setSidePanelClient] = useState<MeetSidePanelClient>();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [correctParticipantId, setCorrectParticipantId] = useState<string>("");
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    async function initialize() {
      const session = await meet.addon.createAddonSession({
        cloudProjectNumber: CLOUD_PROJECT_NUMBER,
      });
      const client = await session.createSidePanelClient();
      setSidePanelClient(client);

      try {
        const list = await listParticipants();
        setParticipants(list);
      } catch (err) {
        console.error("Error loading participants:", err);
        setError("No s'han pogut carregar els participants. Comprova la connexió.");
      }
    }
    initialize();
  }, []);

  async function startVoting() {
    if (!sidePanelClient) return;
    if (!correctParticipantId) {
      setError("Si us plau, selecciona qui és l'artista d'avui");
      return;
    }

    setIsStarting(true);
    setError("");

    try {
      const pollId = generatePollId();
      await createPoll({ pollId, correctParticipantId });

      const state: PollState = {
        pollId,
        correctParticipantId,
        participants,
        artistVoted: false,
      };

      await sidePanelClient.startActivity({
        mainStageUrl: MAIN_STAGE_URL,
        sidePanelUrl: ACTIVITY_SIDE_PANEL_URL,
        additionalData: JSON.stringify(state),
      });

      sessionStorage.setItem("hostOfPollId", pollId);
      window.location.replace(ACTIVITY_SIDE_PANEL_URL + window.location.search);
    } catch (err) {
      console.error("Error starting voting activity:", err);
      setError("Error iniciant la votació. Torna-ho a provar.");
      setIsStarting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col p-6 bg-paper">
      <div className="max-w-md mx-auto w-full">
        <div className="text-center mb-6">
          <div className="mb-3 flex justify-center gap-2">
            <span className="text-3xl">🎨</span>
            <span className="text-3xl">✨</span>
          </div>
          <h1 className="font-heading text-3xl font-bold text-crayon-purple mb-2">Qui és l&apos;artista?</h1>
          <p className="font-body text-base text-text-secondary">Selecciona l&apos;artista d&apos;avui</p>
        </div>

        {participants.length === 0 && !error && (
          <p className="text-center font-body text-text-secondary">Carregant participants...</p>
        )}

        {participants.length > 0 && (
          <div className="mb-6">
            <label className="block font-heading text-lg font-bold text-text-primary mb-3" htmlFor="artist-select">
              Qui és l&apos;artista d&apos;avui?
            </label>
            <select
              id="artist-select"
              value={correctParticipantId}
              onChange={(e) => {
                setCorrectParticipantId(e.target.value);
                setError("");
              }}
              className="w-full px-3 py-2 border-3 border-crayon-purple/50 hand-drawn-subtle bg-card text-text-primary font-body focus:outline-none focus:border-crayon-purple focus:ring-2 focus:ring-crayon-purple/20"
            >
              <option value="" disabled>Selecciona l&apos;artista...</option>
              {participants.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}

        {error && (
          <div className="mb-4 p-4 bg-crayon-red/10 border-3 border-crayon-red hand-drawn-subtle">
            <p className="font-body text-base text-crayon-red font-semibold">{error}</p>
          </div>
        )}

        <button
          type="button"
          onClick={startVoting}
          disabled={!sidePanelClient || isStarting || participants.length === 0}
          aria-label="Començar la votació"
          className={`w-full py-4 px-6 hand-drawn border-3 font-heading text-xl font-bold text-white transition-all duration-200 flex items-center justify-center gap-3 ${
            !sidePanelClient || isStarting || participants.length === 0
              ? "bg-text-secondary/40 border-text-secondary/40 cursor-not-allowed"
              : "bg-crayon-green border-crayon-green shadow-playful-green hover:scale-[1.02] hover:rotate-1 active:scale-[0.98] active:rotate-0"
          }`}
        >
          {isStarting ? (
            <>
              <span className="inline-block animate-spin rounded-full h-6 w-6 border-3 border-white/30 border-t-white" />
              <span>Iniciant votació...</span>
            </>
          ) : (
            <>
              <span className="text-2xl">🎨</span>
              <span>Començar votació</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
