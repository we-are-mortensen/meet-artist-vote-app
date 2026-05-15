import type { Participant, Vote, VoteResult, VoteResults } from "../types/poll.types";

/**
 * Aggregates votes by the participant they voted for, sorted by count descending.
 * Also returns the list of participants who guessed the correct answer.
 */
export function calculateResults(
  votes: Vote[],
  participants: Participant[],
  correctParticipantId: string
): VoteResults {
  const totalVotes = votes.length;
  const participantsById = new Map(participants.map((p) => [p.id, p]));

  const counts = new Map<string, number>();
  for (const p of participants) counts.set(p.id, 0);
  for (const v of votes) {
    counts.set(v.votedForId, (counts.get(v.votedForId) ?? 0) + 1);
  }

  const results: VoteResult[] = Array.from(counts.entries())
    .map(([participantId, voteCount]) => {
      const p = participantsById.get(participantId);
      return {
        participantId,
        participantName: p?.name ?? "?",
        voteCount,
        percentage: totalVotes > 0 ? (voteCount / totalVotes) * 100 : 0,
      };
    })
    .sort((a, b) => b.voteCount - a.voteCount);

  const correctGuessers: Participant[] = votes
    .filter((v) => v.votedForId === correctParticipantId)
    .map((v) => participantsById.get(v.voterParticipantId))
    .filter((p): p is Participant => Boolean(p));

  return { results, totalVotes, correctGuessers };
}

/**
 * Generates a unique poll ID with the legacy prefix scheme.
 */
export function generatePollId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `poll_${timestamp}_${random}`;
}
