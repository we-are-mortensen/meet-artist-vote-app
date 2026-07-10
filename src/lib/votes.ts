"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
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

/** A vote plus the poll it belongs to — used to compute cross-poll stats (e.g. accuracy). */
export type VoteWithPoll = { pollId: string; voterParticipantId: string; votedForId: string };

/** Load every vote across all polls (for leaderboard guess-accuracy). */
export async function loadAllVotes(): Promise<VoteWithPoll[]> {
  const { data, error } = await supabase
    .from("votes")
    .select("poll_id, voter_participant_id, voted_for_id");
  if (error) {
    throw new Error(`Failed to load all votes: ${error.message}`);
  }
  return (data as VoteRow[]).map((r) => ({
    pollId: r.poll_id,
    voterParticipantId: r.voter_participant_id,
    votedForId: r.voted_for_id,
  }));
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

/**
 * Subscribes to INSERT/UPDATE events on the votes table for a single poll.
 * Acts as an at-least-once backstop for dropped VOTE_CAST broadcasts.
 */
export function subscribeToVotes(
  pollId: string,
  onVote: (vote: Vote) => void
): RealtimeChannel {
  const channel = supabase
    .channel(`votes-cdc-${pollId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "votes",
        filter: `poll_id=eq.${pollId}`,
      },
      (payload) => onVote(rowToVote(payload.new as VoteRow))
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "votes",
        filter: `poll_id=eq.${pollId}`,
      },
      (payload) => onVote(rowToVote(payload.new as VoteRow))
    )
    .subscribe();
  return channel;
}
