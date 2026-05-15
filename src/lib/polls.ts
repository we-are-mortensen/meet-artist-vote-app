"use client";

import { supabase } from "./supabase";
import type { PollStatus } from "@/types/poll.types";

type PollRow = {
  id: string;
  correct_participant_id: string;
  status: PollStatus;
  scored_at: string | null;
};

export type PollRecord = {
  id: string;
  correctParticipantId: string;
  status: PollStatus;
};

function rowToRecord(row: PollRow): PollRecord {
  return {
    id: row.id,
    correctParticipantId: row.correct_participant_id,
    status: row.status,
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

export async function getPoll(pollId: string): Promise<PollRecord | null> {
  const { data, error } = await supabase
    .from("polls")
    .select("id, correct_participant_id, status, scored_at")
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
