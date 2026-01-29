import { supabase } from './supabase';
import type { Vote } from '@/types/poll.types';

type VoteRow = {
  id: string;
  poll_id: string;
  voter_id: string;
  selected_option_id: string;
  timestamp: number;
  created_at: string;
};

function rowToVote(row: VoteRow): Vote {
  return {
    voterId: row.voter_id,
    selectedOptionId: row.selected_option_id,
    timestamp: row.timestamp,
  };
}

/**
 * Saves a vote to the database.
 * Uses UPSERT to handle vote changes (same voter voting again replaces their vote).
 */
export async function saveVote(pollId: string, vote: Vote): Promise<void> {
  const { error } = await supabase
    .from('poll_votes')
    .upsert(
      {
        poll_id: pollId,
        voter_id: vote.voterId,
        selected_option_id: vote.selectedOptionId,
        timestamp: vote.timestamp,
      },
      {
        onConflict: 'poll_id,voter_id',
      }
    );

  if (error) {
    console.error('Error saving vote to database:', error);
    throw new Error(`Failed to save vote: ${error.message}`);
  }
}

/**
 * Loads all votes for a poll from the database.
 */
export async function loadVotes(pollId: string): Promise<Vote[]> {
  const { data, error } = await supabase
    .from('poll_votes')
    .select('*')
    .eq('poll_id', pollId)
    .order('timestamp', { ascending: true });

  if (error) {
    console.error('Error loading votes from database:', error);
    throw new Error(`Failed to load votes: ${error.message}`);
  }

  return (data as VoteRow[]).map(rowToVote);
}
