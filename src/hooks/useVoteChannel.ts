'use client';

import { useEffect, useRef, useCallback } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { Vote, PollMessage } from '@/types/poll.types';

type VoteCallback = (vote: Vote) => void;

interface UseVoteChannelReturn {
  sendVote: (vote: Vote) => Promise<void>;
  isConnected: boolean;
}

/**
 * Custom hook for Supabase Realtime vote broadcasting
 * Creates a channel based on pollId and handles vote pub/sub
 */
export function useVoteChannel(
  pollId: string | null,
  onVoteReceived?: VoteCallback
): UseVoteChannelReturn {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const isConnectedRef = useRef(false);

  useEffect(() => {
    if (!pollId) return;

    const channelName = `poll-votes-${pollId}`;
    const channel = supabase.channel(channelName);

    channel
      .on('broadcast', { event: 'vote' }, (payload) => {
        try {
          const message = payload.payload as PollMessage;
          if (message.type === 'VOTE_CAST' && onVoteReceived) {
            onVoteReceived(message.payload as Vote);
          }
        } catch (error) {
          console.error('Error processing vote message:', error);
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          isConnectedRef.current = true;
        } else {
          isConnectedRef.current = false;
        }
      });

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
      isConnectedRef.current = false;
    };
  }, [pollId, onVoteReceived]);

  const sendVote = useCallback(
    async (vote: Vote): Promise<void> => {
      if (!channelRef.current) {
        throw new Error('Channel not connected');
      }

      const message: PollMessage = {
        type: 'VOTE_CAST',
        payload: vote,
        timestamp: Date.now(),
      };

      await channelRef.current.send({
        type: 'broadcast',
        event: 'vote',
        payload: message,
      });
    },
    []
  );

  return {
    sendVote,
    isConnected: isConnectedRef.current,
  };
}
