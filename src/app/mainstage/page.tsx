"use client";

import { useEffect, useState, useCallback } from "react";
import { meet, MeetMainStageClient } from "@googleworkspace/meet-addons/meet.addons";
import { CLOUD_PROJECT_NUMBER } from "@/shared/constants";
import type { Participant, PollState, Vote, ScoreEvent } from "@/types/poll.types";
import { calculateResults } from "@/utils/voteCalculations";
import { loadVotes, subscribeToVotes } from "@/lib/votes";
import { listParticipants, subscribeToParticipants } from "@/lib/participants";
import { getPoll } from "@/lib/polls";
import { loadScoreEvents } from "@/lib/scoring";
import { useVoteChannel } from "@/hooks/useVoteChannel";
import VotingProgress from "@/components/VotingProgress";
import ResultsView from "@/components/ResultsView";
import LeaderboardView from "@/components/LeaderboardView";

type View = "voting" | "results" | "leaderboard";

export default function Page() {
  const [pollState, setPollState] = useState<PollState | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [view, setView] = useState<View>("voting");
  const [scoreEvents, setScoreEvents] = useState<ScoreEvent[]>([]);

  const handleVoteReceived = useCallback((vote: Vote) => {
    setVotes((prev) => {
      const filtered = prev.filter((v) => v.voterParticipantId !== vote.voterParticipantId);
      return [...filtered, vote];
    });
  }, []);

  const handleRevealResults = useCallback(async () => {
    if (!pollState) return;
    try {
      const fresh = await loadVotes(pollState.pollId);
      setVotes(fresh);
    } catch (err) {
      console.error("Error reloading votes on reveal:", err);
    }
    setView((v) => (v === "voting" ? "results" : v));
  }, [pollState]);

  const handleShowLeaderboard = useCallback(async () => {
    if (!pollState) return;
    try {
      const [events, freshParticipants] = await Promise.all([
        loadScoreEvents(pollState.pollId),
        listParticipants(),
      ]);
      setScoreEvents(events);
      setParticipants(freshParticipants);
      setView("leaderboard");
    } catch (err) {
      console.error("Error transitioning to leaderboard:", err);
    }
  }, [pollState]);

  useVoteChannel(
    pollState?.pollId ?? null,
    handleVoteReceived,
    handleRevealResults,
    handleShowLeaderboard
  );

  // Live updates to participants.points so the leaderboard reflects scoring.
  useEffect(() => {
    const channel = subscribeToParticipants((updated) => {
      setParticipants((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    });
    return () => {
      channel.unsubscribe();
    };
  }, []);

  // CDC backstop: catch any VOTE_CAST broadcasts dropped before the channel
  // finished subscribing, or lost to transient network failures.
  useEffect(() => {
    if (!pollState?.pollId) return;
    const channel = subscribeToVotes(pollState.pollId, handleVoteReceived);
    return () => {
      channel.unsubscribe();
    };
  }, [pollState?.pollId, handleVoteReceived]);

  // Cold-start: parse starting state, then sync with DB for late joiners.
  useEffect(() => {
    async function initialize() {
      const session = await meet.addon.createAddonSession({
        cloudProjectNumber: CLOUD_PROJECT_NUMBER,
      });
      const client: MeetMainStageClient = await session.createMainStageClient();
      const starting = await client.getActivityStartingState();
      if (!starting.additionalData) return;

      const state = JSON.parse(starting.additionalData) as PollState;
      setPollState(state);
      setParticipants(state.participants);

      try {
        const persisted = await getPoll(state.pollId);
        const status = persisted?.status ?? "voting";

        if (status === "voting") {
          const v = await loadVotes(state.pollId);
          setVotes(v);
          setView("voting");
        } else if (status === "revealed") {
          const v = await loadVotes(state.pollId);
          setVotes(v);
          setView("results");
        } else {
          // scored
          const [v, events, fresh] = await Promise.all([
            loadVotes(state.pollId),
            loadScoreEvents(state.pollId),
            listParticipants(),
          ]);
          setVotes(v);
          setScoreEvents(events);
          setParticipants(fresh);
          setView("leaderboard");
        }
      } catch (err) {
        console.error("Error syncing main stage with DB:", err);
      }
    }
    initialize();
  }, []);

  if (!pollState) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper bg-confetti">
        <p className="font-heading text-2xl text-crayon-purple font-bold">Inicialitzant...</p>
      </div>
    );
  }

  const artist =
    participants.find((p) => p.id === pollState.correctParticipantId) ??
    pollState.participants.find((p) => p.id === pollState.correctParticipantId)!;

  if (view === "voting") {
    return (
      <div className="min-h-screen bg-paper bg-confetti py-8 px-4">
        <VotingProgress voteCount={votes.length} />
      </div>
    );
  }

  if (view === "results") {
    const results = calculateResults(votes, participants, pollState.correctParticipantId);
    return (
      <div className="min-h-screen bg-paper bg-confetti py-8 px-4">
        <ResultsView results={results} artist={artist} />
      </div>
    );
  }

  // leaderboard
  const deltasByParticipantId: Record<string, number> = {};
  for (const e of scoreEvents) {
    deltasByParticipantId[e.participantId] =
      (deltasByParticipantId[e.participantId] ?? 0) + e.delta;
  }

  return (
    <div className="min-h-screen bg-paper bg-confetti py-8 px-4">
      <LeaderboardView
        participants={participants}
        deltasByParticipantId={deltasByParticipantId}
      />
    </div>
  );
}
