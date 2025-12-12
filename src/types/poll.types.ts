/**
 * Type definitions for the Artist Vote polling system
 */

/**
 * Represents a poll option that users can vote for
 */
export type PollOption = {
  /** Unique identifier for the option */
  id: string;
  /** Display name of the option (in Catalan or as provided) */
  name: string;
};

/**
 * Represents a single anonymous vote
 */
export type Vote = {
  /** Anonymous ID of the voter */
  voterId: string;
  /** ID of the option that was voted for */
  selectedOptionId: string;
  /** Unix timestamp when the vote was cast */
  timestamp: number;
};

/**
 * Overall state of the poll
 */
export type PollState = {
  /** List of all poll options that can be voted for */
  options: PollOption[];
  /** All votes that have been cast */
  votes: Vote[];
  /** Current status of the poll */
  status: 'setup' | 'voting' | 'completed';
  /** Poll question (in Catalan) */
  question: string;
  /** ID of the poll (useful for tiebreaker rounds) */
  pollId: string;
  /** Round number (1 for initial, 2+ for tiebreakers) */
  round: number;
  /** Source of the poll options */
  optionsSource: 'predefined' | 'custom';
};

/**
 * Calculated results for a single poll option
 */
export type VoteResult = {
  /** ID of the poll option */
  optionId: string;
  /** Name of the poll option */
  optionName: string;
  /** Number of votes received */
  voteCount: number;
  /** Percentage of total votes (0-100) */
  percentage: number;
};

/**
 * Complete voting results
 */
export type VoteResults = {
  /** Results for each option, sorted by vote count descending */
  results: VoteResult[];
  /** Total number of votes cast */
  totalVotes: number;
  /** Whether there's a tie for first place */
  hasTie: boolean;
  /** Options that are tied (if any) */
  tiedOptions: PollOption[];
  /** The winner (if no tie) */
  winner: VoteResult | null;
};

/**
 * Message types for Supabase Realtime broadcast
 */
export type MessageType = 'VOTE_CAST' | 'REVEAL_RESULTS';

/**
 * Supabase Realtime message structure
 */
export type PollMessage =
  | { type: 'VOTE_CAST'; payload: Vote; timestamp: number }
  | { type: 'REVEAL_RESULTS'; payload: null; timestamp: number };

/**
 * Predefined list of poll options loaded from JSON
 */
export type PredefinedList = {
  /** Unique identifier for the list */
  id: string;
  /** Display name of the list (in Catalan) */
  name: string;
  /** Description of the list (in Catalan) */
  description: string;
  /** Array of option names */
  options: string[];
};

/**
 * Container for all predefined lists
 */
export type PredefinedListsData = {
  /** Array of available predefined lists */
  lists: PredefinedList[];
};
