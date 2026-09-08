const GRAPHQL_URL = "https://leetcode.com/graphql";

export interface RecentSubmission {
  title: string;
  titleSlug: string;
  timestamp: string;
  statusDisplay: string;
  lang: string;
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

export async function getAcRate(titleSlug: string): Promise<number | null> {
  const data = await gql(
    `query($titleSlug:String!){question(titleSlug:$titleSlug){acRate}}`,
    { titleSlug }
  );
  const rate = data?.data?.question?.acRate;
  return typeof rate === "number" ? rate : null;
}

/** Score = 100 - acceptanceRate. Harder problem (low acRate) = higher score. */
export function scoreFor(acRate: number | null): number {
  if (acRate == null) return 0;
  return Math.round((100 - acRate) * 100) / 100;
}

export function dayKey(tsSeconds: string | number): string {
  const d = new Date(Number(tsSeconds) * 1000);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD UTC
}
