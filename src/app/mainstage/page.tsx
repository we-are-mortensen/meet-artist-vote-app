'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  meet,
  MeetMainStageClient,
} from '@googleworkspace/meet-addons/meet.addons';
import { CLOUD_PROJECT_NUMBER } from '../../shared/constants';
import type {
  PollOption,
  Vote,
  PollState,
  VoteResults as VoteResultsType,
} from '../../types/poll.types';
import { calculateResults } from '../../utils/voteCalculations';
import { useVoteChannel } from '../../hooks/useVoteChannel';
import VoteResults from '../../components/VoteResults';

/**
 * Main stage view - displays voting results in real-time
 * @see {@link https://developers.google.com/meet/add-ons/guides/overview#main-stage}
 */
export default function Page() {
  const [pollState, setPollState] = useState<PollState | null>(null);
  const [options, setOptions] = useState<PollOption[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [results, setResults] = useState<VoteResultsType | null>(null);

  // Handle incoming votes from Supabase Realtime
  const handleVoteReceived = useCallback((vote: Vote) => {
    setVotes((prev) => {
      // Replace vote if same voter (allow vote changes)
      const filtered = prev.filter((v) => v.voterId !== vote.voterId);
      return [...filtered, vote];
    });
  }, []);

  // Subscribe to Supabase Realtime channel for votes
  useVoteChannel(pollState?.pollId ?? null, handleVoteReceived);

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
        console.error('Error parsing starting state:', error);
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-16 w-16 border-4 border-gray-300 border-t-blue-600 mb-4"></div>
          <p className="text-xl text-gray-600 dark:text-gray-400">
            Inicialitzant votació...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
      {results ? (
        <VoteResults results={results} votingInProgress={pollState.status === 'voting'} />
      ) : (
        <div className="max-w-4xl mx-auto text-center py-12">
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              Qui és l&apos;artista d&apos;avui?
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-400">
              Esperant vots...
            </p>
          </div>
          <div className="inline-block animate-pulse">
            <svg
              className="h-24 w-24 text-gray-400 mx-auto"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
              />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}
