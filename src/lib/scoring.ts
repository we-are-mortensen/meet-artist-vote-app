"use client";

import { supabase } from "./supabase";
import type { ScoreEvent, ScoreEventReason } from "@/types/poll.types";

type ScoreEventRow = {
  poll_id: string;
  participant_id: string;
  delta: number;
  reason: ScoreEventReason;
};

function rowToEvent(row: ScoreEventRow): ScoreEvent {
  return {
    pollId: row.poll_id,
    participantId: row.participant_id,
    delta: row.delta,
    reason: row.reason,
  };
}

/**
 * Invokes the server-side scoring function. Idempotent: a second call after
 * the poll has been scored is a no-op on the server side.
 */
export async function scorePoll(pollId: string): Promise<void> {
  const { error } = await supabase.rpc("score_poll", { p_poll_id: pollId });
  if (error) {
    throw new Error(`Failed to score poll: ${error.message}`);
  }
}

export async function loadScoreEvents(pollId: string): Promise<ScoreEvent[]> {
  const { data, error } = await supabase
    .from("score_events")
    .select("poll_id, participant_id, delta, reason")
    .eq("poll_id", pollId);
  if (error) {
    throw new Error(`Failed to load score events: ${error.message}`);
  }
  return (data as ScoreEventRow[]).map(rowToEvent);
}
