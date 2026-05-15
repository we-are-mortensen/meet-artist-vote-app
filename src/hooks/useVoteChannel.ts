"use client";

import { useEffect, useRef, useCallback } from "react";
import { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { saveVote } from "@/lib/votes";
import { Vote, PollMessage } from "@/types/poll.types";

type VoteCallback = (vote: Vote) => void;
type RevealCallback = () => void;
type ShowLeaderboardCallback = () => void;

interface UseVoteChannelReturn {
  sendVote: (vote: Vote) => Promise<void>;
  sendRevealCommand: () => Promise<void>;
  sendShowLeaderboard: () => Promise<void>;
  isConnected: boolean;
}

/**
 * Realtime channel hook for a single poll.
 * Sends and receives VOTE_CAST, REVEAL_RESULTS, and SHOW_LEADERBOARD broadcasts.
 */
export function useVoteChannel(
  pollId: string | null,
  onVoteReceived?: VoteCallback,
  onRevealResults?: RevealCallback,
  onShowLeaderboard?: ShowLeaderboardCallback
): UseVoteChannelReturn {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const isConnectedRef = useRef(false);

  useEffect(() => {
    if (!pollId) return;

    const channelName = `poll-votes-${pollId}`;
    const channel = supabase.channel(channelName);

    channel
      .on("broadcast", { event: "poll" }, (payload) => {
        try {
          const message = payload.payload as PollMessage;
          if (message.type === "VOTE_CAST" && onVoteReceived) {
            onVoteReceived(message.payload);
          } else if (message.type === "REVEAL_RESULTS" && onRevealResults) {
            onRevealResults();
          } else if (message.type === "SHOW_LEADERBOARD" && onShowLeaderboard) {
            onShowLeaderboard();
          }
        } catch (error) {
          console.error("Error processing message:", error);
        }
      })
      .subscribe((status) => {
        isConnectedRef.current = status === "SUBSCRIBED";
      });

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
      isConnectedRef.current = false;
    };
  }, [pollId, onVoteReceived, onRevealResults, onShowLeaderboard]);

  const sendVote = useCallback(
    async (vote: Vote): Promise<void> => {
      if (!channelRef.current || !pollId) {
        throw new Error("Channel not connected");
      }
      await saveVote(pollId, vote);
      const message: PollMessage = {
        type: "VOTE_CAST",
        payload: vote,
        timestamp: Date.now(),
      };
      await channelRef.current.send({ type: "broadcast", event: "poll", payload: message });
    },
    [pollId]
  );

  const sendRevealCommand = useCallback(async (): Promise<void> => {
    if (!channelRef.current) throw new Error("Channel not connected");
    const message: PollMessage = { type: "REVEAL_RESULTS", payload: null, timestamp: Date.now() };
    await channelRef.current.send({ type: "broadcast", event: "poll", payload: message });
  }, []);

  const sendShowLeaderboard = useCallback(async (): Promise<void> => {
    if (!channelRef.current) throw new Error("Channel not connected");
    const message: PollMessage = { type: "SHOW_LEADERBOARD", payload: null, timestamp: Date.now() };
    await channelRef.current.send({ type: "broadcast", event: "poll", payload: message });
  }, []);

  return {
    sendVote,
    sendRevealCommand,
    sendShowLeaderboard,
    isConnected: isConnectedRef.current,
  };
}
