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
  let res: Response;
  try {
    res = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Origin: "https://leetcode.com",
        Referer: "https://leetcode.com",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      },
      body: JSON.stringify({ query, variables }),
      next: { revalidate: 0 },
      cache: "no-store",
    });
  } catch (err) {
    throw new Error(
      `LeetCode network error: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  if (res.status === 429) throw new Error("LeetCode rate limited (429)");
  if (res.status === 403)
    throw new Error("LeetCode forbidden (403) — request blocked, retry next tick");
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LeetCode HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
  const json = await res.json().catch(() => null);
  const errors = (json as { errors?: { message?: string }[] } | null)?.errors;
  if (errors?.length)
    throw new Error(`LeetCode GraphQL: ${errors.map((e) => e.message ?? "unknown").join("; ").slice(0, 300)}`);
  return json;
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