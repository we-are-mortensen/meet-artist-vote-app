"use client";

import { supabase } from "./supabase";
import type { Vote } from "@/types/poll.types";

type VoteRow = {
  poll_id: string;
  voter_participant_id: string;
  voted_for_id: string;
  timestamp: number;
};

function rowToVote(row: VoteRow): Vote {
  return {
    voterParticipantId: row.voter_participant_id,
    votedForId: row.voted_for_id,
    timestamp: row.timestamp,
  };
}

/**
 * UPSERT a vote. "Last vote wins" because (poll_id, voter_participant_id) is the PK.
 */
export async function saveVote(pollId: string, vote: Vote): Promise<void> {
  const { error } = await supabase
    .from("votes")
    .upsert(
      {
        poll_id: pollId,
        voter_participant_id: vote.voterParticipantId,
        voted_for_id: vote.votedForId,
        timestamp: vote.timestamp,
      },
      { onConflict: "poll_id,voter_participant_id" }
    );
  if (error) {
    throw new Error(`Failed to save vote: ${error.message}`);
  }
}

export async function loadVotes(pollId: string): Promise<Vote[]> {
  const { data, error } = await supabase
    .from("votes")
    .select("poll_id, voter_participant_id, voted_for_id, timestamp")
    .eq("poll_id", pollId)
    .order("timestamp", { ascending: true });
  if (error) {
    throw new Error(`Failed to load votes: ${error.message}`);
  }
  return (data as VoteRow[]).map(rowToVote);
}
