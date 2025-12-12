"use client";

import { useEffect, useState, useCallback } from "react";
import { meet, MeetSidePanelClient } from "@googleworkspace/meet-addons/meet.addons";
import { CLOUD_PROJECT_NUMBER } from "../../shared/constants";
import type { Vote, PollState } from "../../types/poll.types";
import { generateVoterId } from "../../utils/voteCalculations";
import { useVoteChannel } from "../../hooks/useVoteChannel";
import PollQuestion from "../../components/PollQuestion";
import OptionList from "../../components/OptionList";
import VoteButton from "../../components/VoteButton";
import VoteConfirmation from "../../components/VoteConfirmation";

/**
 * Activity side panel for voting
 * Participants vote directly on predefined poll options
 * @see {@link https://developers.google.com/meet/add-ons/guides/overview#side-panel}
 */
export default function Page() {
  const [sidePanelClient, setSidePanelClient] = useState<MeetSidePanelClient>();
  const [pollState, setPollState] = useState<PollState | null>(null);

  // Anonymous voter ID (generated once on load)
  const [voterId] = useState(() => generateVoterId());

  // Voting state
  const [selectedOptionId, setSelectedOptionId] = useState("");
  const [hasVoted, setHasVoted] = useState(false);
  const [votedForName, setVotedForName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reveal state
  const [hasRevealed, setHasRevealed] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);

  // Host detection - only the activity initiator can reveal results
  const [isHost, setIsHost] = useState(false);

  // Handle incoming votes from other participants (updates local state)
  const handleVoteReceived = useCallback((vote: Vote) => {
    setPollState((prev) => {
      if (!prev) return prev;
      const filteredVotes = prev.votes.filter((v) => v.voterId !== vote.voterId);
      return {
        ...prev,
        votes: [...filteredVotes, vote],
      };
    });
  }, []);

  // Handle reveal results command received from others
  const handleRevealResults = useCallback(() => {
    setHasRevealed(true);
  }, []);

  // Supabase Realtime channel for votes and reveal command
  const { sendVote, sendRevealCommand } = useVoteChannel(pollState?.pollId ?? null, handleVoteReceived, handleRevealResults);

  /**
   * Handles vote submission via Supabase broadcast
   */
  async function handleVoteSubmit() {
    if (!selectedOptionId || !pollState) {
      return;
    }

    if (!selectedOptionId) {
      alert("Si us plau, selecciona una opció");
      return;
    }

    setIsSubmitting(true);

    try {
      const vote: Vote = {
        voterId: voterId,
        selectedOptionId,
        timestamp: Date.now(),
      };

      // Find the name of the option that was voted for
      const votedFor = pollState.options.find((option) => option.id === selectedOptionId);
      setVotedForName(votedFor?.name || "Desconegut");

      // Send vote via Supabase Realtime broadcast
      await sendVote(vote);

      setHasVoted(true);
    } catch (error) {
      console.error("Error submitting vote:", error);
      alert("Error enviant el vot. Torna-ho a provar.");
    } finally {
      setIsSubmitting(false);
    }
  }

  /**
   * Handles revealing results via Supabase broadcast
   */
  async function handleRevealClick() {
    if (hasRevealed || isRevealing) return;

    setIsRevealing(true);
    try {
      await sendRevealCommand();
      setHasRevealed(true);
    } catch (error) {
      console.error("Error revealing results:", error);
      alert("Error revelant els resultats. Torna-ho a provar.");
    } finally {
      setIsRevealing(false);
    }
  }

  useEffect(() => {
    /**
     * Initializes the Add-on Side Panel Client and gets starting state
     */
    async function initializeSidePanelClient() {
      const session = await meet.addon.createAddonSession({
        cloudProjectNumber: CLOUD_PROJECT_NUMBER,
      });
      const client = await session.createSidePanelClient();
      setSidePanelClient(client);

      // Get the starting poll state
      const startingState = await client.getActivityStartingState();
      if (startingState.additionalData) {
        try {
          const state = JSON.parse(startingState.additionalData) as PollState;
          setPollState(state);

          // Check if this browser tab is the host for THIS specific poll
          // (comparing pollId ensures a new activity in the same session won't inherit host status)
          const hostOfPollId = sessionStorage.getItem("hostOfPollId");
          setIsHost(hostOfPollId === state.pollId);
        } catch (error) {
          console.error("Error parsing poll state:", error);
        }
      }
    }
    initializeSidePanelClient();
  }, []);

  if (!pollState) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-paper">
        <div className="text-center">
          <div className="mb-4 flex justify-center gap-2">
            <span className="text-4xl animate-bounce" style={{ animationDelay: "0ms" }}>
              🎨
            </span>
            <span className="text-4xl animate-bounce" style={{ animationDelay: "100ms" }}>
              ✨
            </span>
            <span className="text-4xl animate-bounce" style={{ animationDelay: "200ms" }}>
              🖌️
            </span>
          </div>
          <p className="font-heading text-xl text-text-secondary font-bold">Carregant...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col p-6 bg-paper">
      <div className="max-w-md mx-auto w-full">
        <PollQuestion round={pollState.round} />

        {hasVoted ? (
          /* Vote confirmation with reveal button */
          <div>
            <VoteConfirmation votedForName={votedForName} />

            {/* Reveal Results Button - Only visible to host */}
            {!hasRevealed && isHost && (
              <button
                onClick={handleRevealClick}
                disabled={isRevealing}
                className={`
                  w-full mt-6 py-4 px-6 hand-drawn border-3
                  font-heading text-xl font-bold text-white
                  transition-all duration-200
                  ${
                    isRevealing
                      ? "bg-text-secondary/40 border-text-secondary/40 cursor-not-allowed"
                      : "bg-crayon-purple border-crayon-purple shadow-playful-purple hover:scale-[1.02] hover:rotate-1 active:scale-[0.98] active:rotate-0"
                  }
                  flex items-center justify-center gap-3
                `}
              >
                {isRevealing ? (
                  <span className="flex items-center justify-center gap-3">
                    <span className="inline-block animate-spin rounded-full h-6 w-6 border-3 border-white/30 border-t-white"></span>
                    Revelant...
                  </span>
                ) : (
                  <>
                    <span className="text-2xl">🏅</span>
                    Revelar resultats
                  </>
                )}
              </button>
            )}

            {/* Results revealed confirmation */}
            {hasRevealed && (
              <div className="mt-6 p-5 bg-crayon-purple/10 border-3 border-crayon-purple hand-drawn text-center">
                <div className="mb-2 flex justify-center gap-2">
                  <span className="text-2xl">🎉</span>
                  <span className="text-2xl">📺</span>
                  <span className="text-2xl">🎉</span>
                </div>
                <p className="font-heading text-lg text-crayon-purple font-bold">Els resultats s&apos;estan mostrant a la pantalla principal</p>
              </div>
            )}
          </div>
        ) : (
          /* Voting interface */
          <div>
            <div className="mb-6">
              <OptionList
                options={pollState.options}
                selectedOptionId={selectedOptionId}
                onSelect={setSelectedOptionId}
                disabled={isSubmitting}
                loading={pollState.options.length === 0}
              />
            </div>

            <VoteButton onClick={handleVoteSubmit} disabled={!selectedOptionId || isSubmitting} loading={isSubmitting} />
          </div>
        )}
      </div>
    </div>
  );
}
