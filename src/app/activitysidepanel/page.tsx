"use client";

import { useEffect, useState, useCallback } from "react";
import { meet, MeetSidePanelClient } from "@googleworkspace/meet-addons/meet.addons";
import { CLOUD_PROJECT_NUMBER } from "@/shared/constants";
import type { Participant, PollState, Vote, StoredIdentity } from "@/types/poll.types";
import { useVoteChannel } from "@/hooks/useVoteChannel";
import { getIdentity, setIdentity as storeIdentity, clearIdentity } from "@/lib/identity";
import { scorePoll } from "@/lib/scoring";
import { revealPoll } from "@/lib/polls";
import IdentityHeader from "@/components/IdentityHeader";
import IdentityPicker from "@/components/IdentityPicker";
import ArtistWaitingView from "@/components/ArtistWaitingView";
import PollQuestion from "@/components/PollQuestion";
import OptionList from "@/components/OptionList";
import VoteButton from "@/components/VoteButton";

export default function Page() {
  const [, setSidePanelClient] = useState<MeetSidePanelClient>();
  const [pollState, setPollState] = useState<PollState | null>(null);
  const [identity, setIdentityState] = useState<StoredIdentity | null>(null);

  // Voting state
  const [selectedOptionId, setSelectedOptionId] = useState("");
  const [hasVoted, setHasVoted] = useState(false);
  const [votedForName, setVotedForName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reveal state
  const [hasRevealed, setHasRevealed] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);
  const [isShowingLeaderboard, setIsShowingLeaderboard] = useState(false);
  const [hasShownLeaderboard, setHasShownLeaderboard] = useState(false);

  const [isHost, setIsHost] = useState(false);

  const handleVoteReceived = useCallback((_vote: Vote) => {
    // Activity panel doesn't need to display vote counts to non-host participants.
    // Kept as a no-op so the channel is fully wired (mainstage cares about this).
  }, []);

  const handleRevealResults = useCallback(() => {
    setHasRevealed(true);
  }, []);

  const handleShowLeaderboard = useCallback(() => {
    setHasShownLeaderboard(true);
  }, []);

  const { sendVote, sendRevealCommand, sendShowLeaderboard } = useVoteChannel(
    pollState?.pollId ?? null,
    handleVoteReceived,
    handleRevealResults,
    handleShowLeaderboard
  );

  useEffect(() => {
    async function initialize() {
      const session = await meet.addon.createAddonSession({
        cloudProjectNumber: CLOUD_PROJECT_NUMBER,
      });
      const client = await session.createSidePanelClient();
      setSidePanelClient(client);

      const startingState = await client.getActivityStartingState();
      if (startingState.additionalData) {
        try {
          const state = JSON.parse(startingState.additionalData) as PollState;
          setPollState(state);
          setIsHost(sessionStorage.getItem("hostOfPollId") === state.pollId);
        } catch (err) {
          console.error("Error parsing poll state:", err);
        }
      }

      setIdentityState(getIdentity());
    }
    initialize();
  }, []);

  function onIdentityPicked(p: Participant) {
    const id: StoredIdentity = { id: p.id, name: p.name };
    storeIdentity(id);
    setIdentityState(id);
  }

  function onChangeIdentity() {
    clearIdentity();
    setIdentityState(null);
    setSelectedOptionId("");
    setHasVoted(false);
  }

  async function handleVoteSubmit() {
    if (!selectedOptionId || !pollState || !identity) return;
    setIsSubmitting(true);
    try {
      const vote: Vote = {
        voterParticipantId: identity.id,
        votedForId: selectedOptionId,
        timestamp: Date.now(),
      };
      const target = pollState.participants.find((p) => p.id === selectedOptionId);
      setVotedForName(target?.name ?? "Desconegut");
      await sendVote(vote);
      setHasVoted(true);
    } catch (err) {
      console.error("Error submitting vote:", err);
      alert("Error enviant el vot. Torna-ho a provar.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRevealClick() {
    if (hasRevealed || isRevealing || !pollState) return;
    setIsRevealing(true);
    try {
      await revealPoll(pollState.pollId);
      await sendRevealCommand();
      setHasRevealed(true);
    } catch (err) {
      console.error("Error revealing results:", err);
      alert("Error revelant els resultats. Torna-ho a provar.");
    } finally {
      setIsRevealing(false);
    }
  }

  async function handleShowLeaderboardClick() {
    if (!pollState || isShowingLeaderboard || hasShownLeaderboard) return;
    setIsShowingLeaderboard(true);
    try {
      await scorePoll(pollState.pollId);
      await sendShowLeaderboard();
      setHasShownLeaderboard(true);
    } catch (err) {
      console.error("Error showing leaderboard:", err);
      alert("Error mostrant la puntuació. Torna-ho a provar.");
    } finally {
      setIsShowingLeaderboard(false);
    }
  }

  if (!pollState) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-paper">
        <p className="font-heading text-xl text-text-secondary font-bold">Carregant...</p>
      </div>
    );
  }

  // Identity not yet chosen → show picker
  if (!identity) {
    return (
      <div className="min-h-screen flex flex-col p-6 bg-paper">
        <IdentityPicker participants={pollState.participants} onPick={onIdentityPicked} />
      </div>
    );
  }

  const isArtist = identity.id === pollState.correctParticipantId;
  const headerInitialPoints =
    pollState.participants.find((p) => p.id === identity.id)?.points ?? 0;

  return (
    <div className="min-h-screen flex flex-col p-6 bg-paper">
      <div className="max-w-md mx-auto w-full">
        <IdentityHeader
          participantId={identity.id}
          name={identity.name}
          initialPoints={headerInitialPoints}
          onChange={onChangeIdentity}
        />

        {isArtist ? (
          <ArtistWaitingView name={identity.name} hasRevealed={hasRevealed} />
        ) : (
          <>
            <PollQuestion />

            {hasVoted ? (
              <div>
                <div className="p-5 bg-crayon-green/10 border-3 border-crayon-green hand-drawn text-center mb-6">
                  <div className="flex justify-center gap-2 mb-2">
                    <span className="text-3xl">✅</span>
                  </div>
                  <p className="font-heading text-lg text-crayon-green font-bold">
                    Has votat per {votedForName}
                  </p>
                </div>

                {isHost && !hasRevealed && (
                  <button
                    type="button"
                    onClick={handleRevealClick}
                    disabled={isRevealing}
                    className={`w-full py-4 px-6 hand-drawn border-3 font-heading text-xl font-bold text-white transition-all duration-200 flex items-center justify-center gap-3 ${
                      isRevealing
                        ? "bg-text-secondary/40 border-text-secondary/40 cursor-not-allowed"
                        : "bg-crayon-purple border-crayon-purple shadow-playful-purple hover:scale-[1.02] hover:rotate-1 active:scale-[0.98] active:rotate-0"
                    }`}
                  >
                    {isRevealing ? "Revelant..." : (<><span className="text-2xl">🏅</span>Revelar resultats</>)}
                  </button>
                )}

                {isHost && hasRevealed && !hasShownLeaderboard && (
                  <button
                    type="button"
                    onClick={handleShowLeaderboardClick}
                    disabled={isShowingLeaderboard}
                    className={`w-full mt-4 py-4 px-6 hand-drawn border-3 font-heading text-xl font-bold text-white transition-all duration-200 flex items-center justify-center gap-3 ${
                      isShowingLeaderboard
                        ? "bg-text-secondary/40 border-text-secondary/40 cursor-not-allowed"
                        : "bg-crayon-orange border-crayon-orange shadow-playful-orange hover:scale-[1.02] hover:rotate-1 active:scale-[0.98] active:rotate-0"
                    }`}
                  >
                    {isShowingLeaderboard ? "Calculant..." : (<><span className="text-2xl">🏆</span>Mostrar puntuació</>)}
                  </button>
                )}

                {hasRevealed && (
                  <div className="mt-6 p-5 bg-crayon-purple/10 border-3 border-crayon-purple hand-drawn text-center">
                    <p className="font-heading text-lg text-crayon-purple font-bold">
                      Els resultats es mostren a la pantalla principal
                    </p>
                  </div>
                )}
              </div>
            ) : hasRevealed ? (
              <div className="p-5 bg-crayon-purple/10 border-3 border-crayon-purple hand-drawn text-center">
                <p className="font-heading text-lg text-crayon-purple font-bold">
                  Els resultats es mostren a la pantalla principal
                </p>
              </div>
            ) : (
              <div>
                <div className="mb-6">
                  <OptionList
                    options={pollState.participants}
                    selectedOptionId={selectedOptionId}
                    onSelect={setSelectedOptionId}
                    disabled={isSubmitting}
                  />
                </div>
                <VoteButton
                  onClick={handleVoteSubmit}
                  disabled={!selectedOptionId || isSubmitting}
                  loading={isSubmitting}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
