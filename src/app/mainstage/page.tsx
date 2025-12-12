"use client";

import { useEffect, useState, useCallback } from "react";
import { meet, MeetMainStageClient } from "@googleworkspace/meet-addons/meet.addons";
import { CLOUD_PROJECT_NUMBER } from "../../shared/constants";
import type { PollOption, Vote, PollState, VoteResults as VoteResultsType } from "../../types/poll.types";
import { calculateResults } from "../../utils/voteCalculations";
import { useVoteChannel } from "../../hooks/useVoteChannel";
import VoteResults from "../../components/VoteResults";

/**
 * Main stage view - displays voting results
 * Results are hidden until the host reveals them
 * @see {@link https://developers.google.com/meet/add-ons/guides/overview#main-stage}
 */
export default function Page() {
  const [pollState, setPollState] = useState<PollState | null>(null);
  const [options, setOptions] = useState<PollOption[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [results, setResults] = useState<VoteResultsType | null>(null);
  const [resultsRevealed, setResultsRevealed] = useState(false);

  // Handle incoming votes from Supabase Realtime
  const handleVoteReceived = useCallback((vote: Vote) => {
    setVotes((prev) => {
      // Replace vote if same voter (allow vote changes)
      const filtered = prev.filter((v) => v.voterId !== vote.voterId);
      return [...filtered, vote];
    });
  }, []);

  // Handle reveal results command
  const handleRevealResults = useCallback(() => {
    setResultsRevealed(true);
  }, []);

  // Subscribe to Supabase Realtime channel for votes and reveal command
  useVoteChannel(pollState?.pollId ?? null, handleVoteReceived, handleRevealResults);

  /**
   * Creates a MeetMainStageClient to control the main stage of the add-on.
   * https://developers.google.com/meet/add-ons/reference/websdk/addon_sdk.meetmainstageclient
   */
  async function initializeMainStageClient(): Promise<MeetMainStageClient> {
    const session = await meet.addon.createAddonSession({
      cloudProjectNumber: CLOUD_PROJECT_NUMBER,
    });
    return await session.createMainStageClient();
  }

  /**
   * Parses the initial poll state from the starting state
   */
  async function setStartingState(mainStageClient: MeetMainStageClient) {
    const startingState = await mainStageClient.getActivityStartingState();
    if (startingState.additionalData) {
      try {
        const state = JSON.parse(startingState.additionalData) as PollState;
        setPollState(state);
        setOptions(state.options);
        setVotes(state.votes);
      } catch (error) {
        console.error("Error parsing starting state:", error);
      }
    }
  }

  // Recalculate results whenever votes or options change
  useEffect(() => {
    if (options.length > 0) {
      const calculatedResults = calculateResults(votes, options);
      setResults(calculatedResults);
    }
  }, [votes, options]);

  useEffect(() => {
    /**
     * Initialize the main stage by initializing the client, then using that
     * client to get the starting state
     */
    async function initializeMainStage() {
      const client = await initializeMainStageClient();
      await setStartingState(client);
    }
    initializeMainStage();
  }, []);

  if (!pollState) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper bg-confetti">
        <div className="text-center">
          <div className="mb-6 flex justify-center gap-3">
            <span className="text-5xl animate-bounce" style={{ animationDelay: "0ms" }}>
              🎨
            </span>
            <span className="text-5xl animate-bounce" style={{ animationDelay: "100ms" }}>
              🖌️
            </span>
            <span className="text-5xl animate-bounce" style={{ animationDelay: "200ms" }}>
              ✨
            </span>
          </div>
          <p className="font-heading text-2xl text-crayon-purple font-bold">Inicialitzant votació...</p>
        </div>
      </div>
    );
  }

  // Show results if revealed
  if (resultsRevealed && results) {
    return (
      <div className="min-h-screen bg-paper bg-confetti py-8 px-4">
        <VoteResults results={results} votingInProgress={false} />
      </div>
    );
  }

  // Show waiting state with vote count (results not revealed yet)
  return (
    <div className="min-h-screen bg-paper bg-confetti py-8 px-4">
      <div className="max-w-4xl mx-auto text-center py-12">
        <div className="mb-8">
          <h1 className="font-heading text-5xl md:text-6xl font-bold text-crayon-purple mb-6">Qui és l&apos;artista d&apos;avui?</h1>

          {/* Vote counter */}
          <div className="mt-8 mb-6">
            <div className="inline-flex items-center justify-center w-40 h-40 hand-drawn border-4 border-crayon-blue bg-crayon-blue/10 shadow-playful">
              <span className="font-heading text-6xl font-bold text-crayon-blue">{votes.length}</span>
            </div>
          </div>

          <p className="font-heading text-3xl font-bold text-text-primary">{votes.length === 1 ? "vot rebut" : "vots rebuts"}</p>

          <p className="font-body text-xl text-text-secondary mt-4">Esperant els resultats...</p>
        </div>

        {/* Waiting animation */}
        <div className="mt-8 flex justify-center gap-3">
          <span className="text-4xl animate-pulse">👀</span>
        </div>

        {/* Colorful dots animation */}
        <div className="mt-6 flex justify-center">
          <div className="flex space-x-3">
            <div className="h-4 w-4 bg-crayon-pink rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
            <div className="h-4 w-4 bg-crayon-blue rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
            <div className="h-4 w-4 bg-crayon-yellow rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
            <div className="h-4 w-4 bg-crayon-green rounded-full animate-bounce" style={{ animationDelay: "450ms" }}></div>
            <div className="h-4 w-4 bg-crayon-purple rounded-full animate-bounce" style={{ animationDelay: "600ms" }}></div>
          </div>
        </div>
      </div>
    </div>
  );
}
