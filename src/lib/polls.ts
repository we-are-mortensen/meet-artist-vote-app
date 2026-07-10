"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { PollStatus } from "@/types/poll.types";

type PollRow = {
  id: string;
  correct_participant_id: string;
  status: PollStatus;
  artist_voted: boolean;
};

export type PollRecord = {
  id: string;
  correctParticipantId: string;
  status: PollStatus;
  artistVoted: boolean;
};

function rowToRecord(row: PollRow): PollRecord {
  return {
    id: row.id,
    correctParticipantId: row.correct_participant_id,
    status: row.status,
    artistVoted: row.artist_voted,
  };
}

export async function createPoll(args: {
  pollId: string;
  correctParticipantId: string;
}): Promise<void> {
  const { error } = await supabase.from("polls").insert({
    id: args.pollId,
    correct_participant_id: args.correctParticipantId,
    status: "voting",
  });
  if (error) {
    throw new Error(`Failed to create poll: ${error.message}`);
  }
}

/** List every poll (for cross-poll leaderboard stats like guess accuracy). */
export async function listPolls(): Promise<PollRecord[]> {
  const { data, error } = await supabase
    .from("polls")
    .select("id, correct_participant_id, status, artist_voted");
  if (error) {
    throw new Error(`Failed to list polls: ${error.message}`);
  }
  return (data as PollRow[]).map(rowToRecord);
}

export async function getPoll(pollId: string): Promise<PollRecord | null> {
  const { data, error } = await supabase
    .from("polls")
    .select("id, correct_participant_id, status, artist_voted")
    .eq("id", pollId)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load poll: ${error.message}`);
  }
  return data ? rowToRecord(data as PollRow) : null;
}

/**
 * Flips the poll from 'voting' to 'revealed'. Idempotent in practice — repeating
 * this call after the status has moved on is a no-op (the WHERE filter matches
 * zero rows). We deliberately don't return rowcount; callers don't need it.
 */
export async function revealPoll(pollId: string): Promise<void> {
  const { error } = await supabase
    .from("polls")
    .update({ status: "revealed" })
    .eq("id", pollId)
    .eq("status", "voting");
  if (error) {
    throw new Error(`Failed to reveal poll: ${error.message}`);
  }
}

/**
 * Marks the artist as having acknowledged the round. Called from the artist's
 * own client when they hit submit — their "vote" is not recorded in the votes
 * table (see activitysidepanel for why), so this is the only signal the main
 * stage gets that the artist is done.
 */
export async function markArtistVoted(pollId: string): Promise<void> {
  const { error } = await supabase
    .from("polls")
    .update({ artist_voted: true })
    .eq("id", pollId);
  if (error) {
    throw new Error(`Failed to mark artist voted: ${error.message}`);
  }
}

/**
 * Subscribes to UPDATE events on a single poll row. The main stage uses this
 * to learn when artist_voted flips, since that change rides on no broadcast.
 */
export function subscribeToPoll(
  pollId: string,
  onUpdate: (poll: PollRecord) => void
): RealtimeChannel {
  const channel = supabase
    .channel(`poll-cdc-${pollId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "polls",
        filter: `id=eq.${pollId}`,
      },
      (payload) => onUpdate(rowToRecord(payload.new as PollRow))
    )
    .subscribe();
  return channel;
}
