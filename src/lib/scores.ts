import { connectDB } from "@/lib/db";
import { getQuestionDetails, scoreFor } from "@/lib/leetcode";
import { Submission } from "@/models/Submission";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface QuestionRow {
  username: string;
  title: string;
  titleSlug: string;
  date: string;
  acRate: number | null;
  difficulty: string | null;
  score: number;
  lang: string;
}

export interface DailyRow {
  username: string;
  date: string;
  total: number;
  count: number;
}

export interface TotalRow {
  username: string;
  total: number;
  count: number;
}

export async function getDayDetail(date: string): Promise<QuestionRow[]> {
  await connectDB();
  // Same deterministic order as the deduped aggregations (earliest solve wins,
  // ties by highest score, then _id), so the collapse below picks the same doc
  // the leaderboard/chart count.
  const docs = await Submission.find({ date, status: "Accepted" })
    .sort({ date: 1, score: -1, _id: 1 })
    .lean();
  // Collapse legacy duplicate docs (same user+question) to one row, mirroring
  // the $group dedupe in getOverallScores/getScoreHistory/getDayScores. Fresh
  // data can't hit this (unique {username,titleSlug} index).
  const seen = new Set<string>();
  const rows = [];
  for (const d of docs) {
    const u = d as { username: string };
    const s = d as { titleSlug: string };
    const key = `${u.username} ${s.titleSlug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(d);
  }
  // Display order: highest score first (previous behavior).
  rows.sort((a, b) => ((b as { score: number }).score ?? 0) - ((a as { score: number }).score ?? 0));
  return rows.map((d) => ({
    username: (d as { username: string }).username,
    title: (d as { title: string }).title ?? "",
    titleSlug: (d as { titleSlug: string }).titleSlug,
    date: (d as { date: string }).date,
    acRate: (d as { acRate?: number | null }).acRate ?? null,
    difficulty: (d as { difficulty?: string | null }).difficulty ?? null,
    score: (d as { score: number }).score,
    lang: (d as { lang?: string }).lang ?? "",
  }));
}

export async function getActiveDates(): Promise<string[]> {
  await connectDB();
  const dates = await Submission.distinct("date", { status: "Accepted" });
  return dates.sort();
}

export async function getOverallScores(): Promise<TotalRow[]> {
  await connectDB();
  const totals = await Submission.aggregate([
    { $match: { status: "Accepted" } },
    // Deterministic $first: earliest solve wins, ties by highest score, then _id.
    // Same order as every other read path so all of them always agree.
    { $sort: { date: 1, score: -1, _id: 1 } },
    {
      $group: {
        _id: { username: "$username", titleSlug: "$titleSlug" },
        score: { $first: "$score" },
      },
    },
    {
      $group: {
        _id: "$_id.username",
        total: { $sum: "$score" },
        count: { $sum: 1 },
      },
    },
    { $sort: { total: -1 } },
  ]);
  return totals.map((t) => ({
    username: t._id as string,
    total: Math.round(t.total * 100) / 100,
    count: t.count as number,
  }));
}

/**
 * Per-user per-date totals (one row per user+date bucket).
 * Stage 1 collapses to one row per username+titleSlug (same dedupe as
 * getOverallScores, so legacy duplicate docs can't inflate the chart),
 * keeping the earliest solve date; stage 2 sums per date+username.
 */
export async function getScoreHistory(): Promise<DailyRow[]> {
  await connectDB();
  const rows = await Submission.aggregate([
    { $match: { status: "Accepted" } },
    { $sort: { date: 1, score: -1, _id: 1 } },
    {
      $group: {
        _id: { username: "$username", titleSlug: "$titleSlug" },
        score: { $first: "$score" },
        date: { $first: "$date" },
      },
    },
    {
      $group: {
        _id: { date: "$date", username: "$_id.username" },
        total: { $sum: "$score" },
        count: { $sum: 1 },
      },
    },
    { $sort: { "_id.date": 1 } },
  ]);
  return rows.map((r) => ({
    username: r._id.username as string,
    date: r._id.date as string,
    total: Math.round((r.total as number) * 100) / 100,
    count: r.count as number,
  }));
}

/** Today's (or any date's) leaderboard: sum of scores for docs in that date bucket.
 * Dedupes by username+titleSlug (highest score wins ties by _id order), same
 * family of rules as getOverallScores/getScoreHistory, so legacy duplicate
 * docs can't inflate day totals. */
export async function getDayScores(date: string): Promise<TotalRow[]> {
  await connectDB();
  const totals = await Submission.aggregate([
    { $match: { status: "Accepted", date } },
    // Same deterministic order as getOverallScores/getScoreHistory.
    { $sort: { date: 1, score: -1, _id: 1 } },
    {
      $group: {
        _id: { username: "$username", titleSlug: "$titleSlug" },
        score: { $first: "$score" },
      },
    },
    {
      $group: {
        _id: "$_id.username",
        total: { $sum: "$score" },
        count: { $sum: 1 },
      },
    },
    { $sort: { total: -1 } },
  ]);
  return totals.map((t) => ({
    username: t._id as string,
    total: Math.round(t.total * 100) / 100,
    count: t.count as number,
  }));
}

/**
 * Re-fetch acRate/difficulty once per question and recompute scores for ALL
 * solvers of that question (canonical score per titleSlug). Shared by the
 * manual /api/refresh endpoint and the in-sync EOD auto-refresh.
 */
export async function refreshDayScores(
  date: string
): Promise<{ updated: number; total: number }> {
  await connectDB();
  const slugs = (await Submission.distinct("titleSlug", { date })) as string[];
  let updated = 0;
  for (const slug of slugs) {
    try {
      const { acRate, difficulty } = await getQuestionDetails(slug);
      if (acRate == null) continue;
      const r = await Submission.updateMany(
        { titleSlug: slug },
        { $set: { acRate, difficulty, score: scoreFor(acRate) } }
      );
      updated += r.modifiedCount ?? 0;
    } catch {
      // rate-limited or gone — leave stale value, retry tomorrow
    }
    await sleep(300);
  }
  const total = await Submission.countDocuments({ date });
  return { updated, total };
}