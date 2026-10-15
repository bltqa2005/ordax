export interface MatchStat {
  id: string;
  /** epoch ms */
  finishedAt: number;
  map: string | null;
  /** null when the result field is missing in the API response */
  win: boolean | null;
  score: string | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  kd: number | null;
  hs: number | null;
  adr: number | null;
  url: string;
}

export interface RecentMatch extends MatchStat {
  startedAt: number | null;
  durationMin: number | null;
  /** score from match history (faction1 / faction2), if available */
  historyScore: string | null;
}

export interface Lifetime {
  matches: number | null;
  wins: number | null;
  winRate: number | null;
  kd: number | null;
  hs: number | null;
  longestWinStreak: number | null;
  currentWinStreak: number | null;
}

export type PlayerStatus = "pending" | "ok" | "not_found" | "mismatch" | "error";

export interface Snapshot {
  t: number;
  elo: number;
  level: number | null;
}

export interface PlayerData {
  nickname: string;
  name: string;
  status: PlayerStatus;
  message?: string;
  /** data comes from an earlier successful fetch because the latest one failed */
  stale?: boolean;
  playerId: string | null;
  avatar: string | null;
  country: string | null;
  faceitUrl: string;
  elo: number | null;
  level: number | null;
  lifetime: Lifetime | null;
  /** newest first */
  matches: MatchStat[];
  /** true when the match sample hit the fetch cap, older matches exist */
  sampleTruncated: boolean;
  last3: RecentMatch[];
  snapshots: Snapshot[];
  fetchedAt: number | null;
}

export interface TeamPayload {
  configured: boolean;
  generatedAt: number | null;
  ok: number;
  failed: number;
  players: PlayerData[];
  notes: string[];
  storage: "redis" | "file";
}
