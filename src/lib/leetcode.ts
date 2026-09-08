const GRAPHQL_URL = "https://leetcode.com/graphql";

export interface RecentSubmission {
  title: string;
  titleSlug: string;
  timestamp: string;
  statusDisplay: string;
  lang: string;
}

export interface QuestionDetails {
  acRate: number | null;
  difficulty: string | null;
}

async function gql(query: string, variables: Record<string, unknown>) {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Referer: "https://leetcode.com",
      "User-Agent": "Mozilla/5.0",
    },
    body: JSON.stringify({ query, variables }),
    next: { revalidate: 0 },
    cache: "no-store",
  });
  if (res.status === 429) throw new Error("LeetCode rate limited (429)");
  if (!res.ok) throw new Error(`LeetCode HTTP ${res.status}`);
  return res.json();
}

export async function getRecentSubmissions(
  username: string,
  limit = 20
): Promise<RecentSubmission[]> {
  const data = await gql(
    `query($username:String!,$limit:Int!){recentSubmissionList(username:$username,limit:$limit){title titleSlug timestamp statusDisplay lang}}`,
    { username, limit }
  );
  return data?.data?.recentSubmissionList ?? [];
}

export async function getQuestionDetails(
  titleSlug: string
): Promise<QuestionDetails> {
  const data = await gql(
    `query($titleSlug:String!){question(titleSlug:$titleSlug){acRate difficulty}}`,
    { titleSlug }
  );
  const q = data?.data?.question;
  return {
    acRate: typeof q?.acRate === "number" ? q.acRate : null,
    difficulty: q?.difficulty ?? null,
  };
}

export function scoreFor(acRate: number | null): number {
  if (acRate == null) return 0;
  return Math.round((100 - acRate) * 100) / 100;
}

export function dayKey(tsSeconds: string | number): string {
  const d = new Date(Number(tsSeconds) * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function todayIST(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Fixed season start (IST date bucket). Sync keeps everything on/after this. */
export const SEASON_START = "2026-09-08";

/** Current IST wall-clock minutes since midnight. */
export function istMinutesNow(): number {
  const now = new Date();
  const ist = new Date(now.getTime() + (5 * 60 + 30) * 60 * 1000);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}