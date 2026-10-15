import type { Period, Row } from "@/lib/analytics";
import { ROSTER } from "@/lib/players";
import type { PlayerData, TeamPayload } from "@/lib/types";

export interface ViewProps {
  data: TeamPayload | null;
  rows: Row[];
  period: Period;
  now: number;
  loading: boolean;
  onOpen: (nickname: string) => void;
}

export function blankPlayers(): PlayerData[] {
  return ROSTER.map((e) => ({
    nickname: e.nickname,
    name: e.name,
    status: "pending" as const,
    playerId: null,
    avatar: null,
    country: null,
    faceitUrl: `https://www.faceit.com/en/players/${encodeURIComponent(e.nickname)}`,
    elo: null,
    level: null,
    lifetime: null,
    matches: [],
    sampleTruncated: false,
    last3: [],
    snapshots: [],
    fetchedAt: null,
  }));
}

export const TABS = [
  ["overview", "Overview"],
  ["roster", "Roster"],
  ["history", "Match History"],
  ["analytics", "Analytics"],
  ["leaderboard", "Leaderboard"],
] as const;

export type TabId = (typeof TABS)[number][0];
