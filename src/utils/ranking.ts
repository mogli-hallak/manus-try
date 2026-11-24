import {
  DecisionCard,
  ParticipantDoc,
  RankedCardResult,
  SwipeRecordDoc,
  TimeOptionDoc,
  TimeOptionSummary,
  TimeVoteDoc,
} from '../types/meetup';

export function computeCardRankings(
  cards: DecisionCard[],
  swipes: SwipeRecordDoc[],
  participants: ParticipantDoc[]
): {
  ranked: RankedCardResult[];
  matchedCards: RankedCardResult[];
  topWinner: RankedCardResult | null;
} {
  const participantMap = new Map<string, string>();
  participants.forEach((p) => {
    participantMap.set(p.uid, p.name);
  });

  const activeParticipantCount = Math.max(participants.length, swipes.length, 1);

  const ranked: RankedCardResult[] = cards.map((card) => {
    let totalPoints = 0;
    let positiveVotes = 0;
    let superLikes = 0;
    const voterNames: string[] = [];

    swipes.forEach((record) => {
      const score = record.choices?.[card.id];
      if (score === 1 || score === 2) {
        totalPoints += score;
        positiveVotes += 1;
        if (score === 2) {
          superLikes += 1;
        }
        const voterName = participantMap.get(record.uid) || 'משתתף';
        voterNames.push(voterName);
      }
    });

    const consensusPercent = Math.min(
      100,
      Math.round((positiveVotes / activeParticipantCount) * 100)
    );
    const isGroupMatch = positiveVotes >= 2;

    return {
      card,
      totalPoints,
      positiveVotes,
      superLikes,
      consensusPercent,
      voterNames,
      isGroupMatch,
    };
  });

  ranked.sort((a, b) => {
    if (b.isGroupMatch !== a.isGroupMatch) return a.isGroupMatch ? -1 : 1;
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (b.positiveVotes !== a.positiveVotes) return b.positiveVotes - a.positiveVotes;
    return b.superLikes - a.superLikes;
  });

  const matchedCards = ranked.filter((item) => item.isGroupMatch);
  const topWinner = ranked.find((item) => item.totalPoints > 0) ?? ranked[0] ?? null;

  return { ranked, matchedCards, topWinner };
}

export function computeTimeSummaries(
  options: TimeOptionDoc[],
  votes: TimeVoteDoc[],
  participants: ParticipantDoc[]
): {
  summaries: TimeOptionSummary[];
  winningTime: TimeOptionSummary | null;
} {
  const participantMap = new Map<string, string>();
  participants.forEach((p) => participantMap.set(p.uid, p.name));

  const denominator = Math.max(participants.length, votes.length, 1);

  const summaries: TimeOptionSummary[] = options.map((option) => {
    const voterIds: string[] = [];
    const voterNames: string[] = [];

    votes.forEach((vote) => {
      if (Array.isArray(vote.slotIds) && vote.slotIds.includes(option.id)) {
        voterIds.push(vote.uid);
        voterNames.push(participantMap.get(vote.uid) || 'משתתף');
      }
    });

    return {
      option,
      voterIds,
      voterNames,
      voteCount: voterIds.length,
      percentage: Math.min(100, Math.round((voterIds.length / denominator) * 100)),
    };
  });

  const sorted = [...summaries].sort((a, b) => b.voteCount - a.voteCount);
  const winningTime = sorted[0] ?? null;

  return { summaries, winningTime };
}

export function formatRemainingTime(endsAtMs: number, nowMs: number): {
  formatted: string;
  isExpired: boolean;
  remainingMs: number;
} {
  const remainingMs = Math.max(0, endsAtMs - nowMs);
  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => String(n).padStart(2, '0');
  const formatted =
    hours > 0
      ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
      : `${pad(minutes)}:${pad(seconds)}`;

  return {
    formatted,
    isExpired: remainingMs <= 0,
    remainingMs,
  };
}
