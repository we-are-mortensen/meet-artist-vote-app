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
 * Fetches all participants, ordered by name ascending.
 */
export async function listParticipants(): Promise<Participant[]> {
  const { data, error } = await supabase
    .from("participants")
    .select("id, name, points")
    .order("name", { ascending: true });

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
