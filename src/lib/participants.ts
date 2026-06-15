"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { Participant } from "@/types/poll.types";

type ParticipantRow = {
  id: string;
  name: string;
  points: number;
};

function rowToParticipant(row: ParticipantRow): Participant {
  return { id: row.id, name: row.name, points: row.points };
}

/**
 * Fetches participants, ordered by name ascending.
 *
 * By default only active participants are returned — this is the list that
 * feeds the host's artist dropdown, the identity picker, and the voting
 * options, so deactivated participants disappear from all of them.
 *
 * Pass `includeInactive: true` to also return deactivated participants. The
 * main stage uses this for the leaderboard, where inactive participants stay
 * visible with their preserved (frozen) points.
 */
export async function listParticipants({
  includeInactive = false,
}: { includeInactive?: boolean } = {}): Promise<Participant[]> {
  let query = supabase
    .from("participants")
    .select("id, name, points")
    .order("name", { ascending: true });

  if (!includeInactive) {
    query = query.eq("active", true);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to load participants: ${error.message}`);
  }
  return (data as ParticipantRow[]).map(rowToParticipant);
}

/**
 * Subscribes to UPDATE events on the participants table.
 * The callback fires with the updated row whenever any participant's points change.
 * Returns the channel so callers can unsubscribe on unmount.
 */
export function subscribeToParticipants(
  onUpdate: (participant: Participant) => void
): RealtimeChannel {
  const channel = supabase
    .channel("participants-cdc")
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "participants" },
      (payload) => {
        const row = payload.new as ParticipantRow;
        onUpdate(rowToParticipant(row));
      }
    )
    .subscribe();
  return channel;
}
