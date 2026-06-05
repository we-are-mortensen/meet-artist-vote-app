/**
 * Type definitions for the Artist Vote gamified polling system.
 */

export type Participant = {
  id: string;
  name: string;
  points: number;
};

export type Vote = {
  voterParticipantId: string;
  votedForId: string;
  timestamp: number;
};

export type PollStatus = "voting" | "revealed" | "scored";

export type PollState = {
  pollId: string;
  correctParticipantId: string;
  participants: Participant[];
  artistVoted: boolean;
};

export type ScoreEventReason =
  | "nobody_guessed"
  | "all_guessed"
  | "correct_guess"
  | "artist_per_wrong_vote";

export type ScoreEvent = {
  pollId: string;
  participantId: string;
  delta: number;
  reason: ScoreEventReason;
};

/**
 * Aggregated per-option result for the results screen.
 */
export type VoteResult = {
  participantId: string;
  participantName: string;
  voteCount: number;
  percentage: number;
};

export type VoteResults = {
  results: VoteResult[];
  totalVotes: number;
  correctGuessers: Participant[];
};

/**
 * Real-time broadcast message envelope.
 */
export type PollMessage =
  | { type: "VOTE_CAST";        payload: Vote;  timestamp: number }
  | { type: "REVEAL_RESULTS";   payload: null;  timestamp: number }
  | { type: "SHOW_LEADERBOARD"; payload: null;  timestamp: number };

/**
 * Identity stored in localStorage so a participant doesn't re-pick on every poll
 * — persists across Meet sessions, not just the current iframe lifetime.
 */
export type StoredIdentity = {
  id: string;
  name: string;
};
