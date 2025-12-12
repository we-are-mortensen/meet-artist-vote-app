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

  // Supabase Realtime channel for votes
  const { sendVote } = useVoteChannel(pollState?.pollId ?? null, handleVoteReceived);

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
          /* Vote confirmation */
          <VoteConfirmation votedForName={votedForName} />
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
