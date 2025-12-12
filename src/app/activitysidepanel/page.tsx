'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  meet,
  MeetSidePanelClient,
} from '@googleworkspace/meet-addons/meet.addons';
import { CLOUD_PROJECT_NUMBER } from '../../shared/constants';
import type { Vote, PollState } from '../../types/poll.types';
import { generateVoterId } from '../../utils/voteCalculations';
import { useVoteChannel } from '../../hooks/useVoteChannel';
import PollQuestion from '../../components/PollQuestion';
import OptionList from '../../components/OptionList';
import VoteButton from '../../components/VoteButton';
import VoteConfirmation from '../../components/VoteConfirmation';

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
  const [selectedOptionId, setSelectedOptionId] = useState('');
  const [hasVoted, setHasVoted] = useState(false);
  const [votedForName, setVotedForName] = useState('');
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
  const { sendVote, sendRevealCommand } = useVoteChannel(
    pollState?.pollId ?? null,
    handleVoteReceived,
    handleRevealResults
  );

  /**
   * Handles vote submission via Supabase broadcast
   */
  async function handleVoteSubmit() {
    if (!selectedOptionId || !pollState) {
      return;
    }

    if (!selectedOptionId) {
      alert('Si us plau, selecciona una opció');
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
      const votedFor = pollState.options.find(
        (option) => option.id === selectedOptionId
      );
      setVotedForName(votedFor?.name || 'Desconegut');

      // Send vote via Supabase Realtime broadcast
      await sendVote(vote);

      setHasVoted(true);
    } catch (error) {
      console.error('Error submitting vote:', error);
      alert('Error enviant el vot. Torna-ho a provar.');
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
      console.error('Error revealing results:', error);
      alert('Error revelant els resultats. Torna-ho a provar.');
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

      // Detect if current user is the host (activity initiator)
      const frameOpenReason = await client.getFrameOpenReason();
      setIsHost(frameOpenReason === 'START_ACTIVITY');

      // Get the starting poll state
      const startingState = await client.getActivityStartingState();
      if (startingState.additionalData) {
        try {
          const state = JSON.parse(startingState.additionalData) as PollState;
          setPollState(state);
        } catch (error) {
          console.error('Error parsing poll state:', error);
        }
      }
    }
    initializeSidePanelClient();
  }, []);


  if (!pollState) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-gray-300 border-t-blue-600 mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Carregant...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col p-6 bg-white dark:bg-gray-900">
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
                  w-full mt-6 py-4 px-6 rounded-lg font-bold text-lg
                  transition-all duration-200
                  ${
                    isRevealing
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-purple-600 hover:bg-purple-700 active:bg-purple-800'
                  }
                  text-white shadow-lg
                `}
              >
                {isRevealing ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg
                      className="animate-spin h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Revelant...
                  </span>
                ) : (
                  'Revelar resultats'
                )}
              </button>
            )}

            {/* Results revealed confirmation */}
            {hasRevealed && (
              <div className="mt-6 p-4 bg-purple-50 dark:bg-purple-900/20 border-2 border-purple-500 rounded-lg text-center">
                <p className="text-purple-700 dark:text-purple-300 font-semibold">
                  Els resultats s&apos;estan mostrant a la pantalla principal
                </p>
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

            <VoteButton
              onClick={handleVoteSubmit}
              disabled={!selectedOptionId || isSubmitting}
              loading={isSubmitting}
            />
          </div>
        )}
      </div>
    </div>
  );
}
