import { connectDB } from "@/lib/db";
import { Submission } from "@/models/Submission";

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

// Score stored per question (one doc per user+titleSlug).
// Defensive $group first so legacy per-submission docs don't double-count.
const DEDUPE = {
  $group: {
    _id: { username: "$username", titleSlug: "$titleSlug" },
    date: { $min: "$date" },
    score: { $first: "$score" },
  },
};

export async function getScores(): Promise<{ daily: DailyRow[]; totals: TotalRow[] }> {
  await connectDB();
  const daily = await Submission.aggregate([
    { $match: { status: "Accepted" } },
    DEDUPE,
    {
      $group: {
        _id: { username: "$_id.username", date: "$date" },
        total: { $sum: "$score" },
        count: { $sum: 1 },
      },
    },
    { $sort: { "_id.date": -1 } },
  ]);
  const rows = daily.map((d) => ({
    username: d._id.username as string,
    date: d._id.date as string,
    total: Math.round(d.total * 100) / 100,
    count: d.count as number,
  }));
  const totals = await Submission.aggregate([
    { $match: { status: "Accepted" } },
    DEDUPE,
    {
      $group: { _id: "$_id.username", total: { $sum: "$score" }, count: { $sum: 1 } },
    },
    { $sort: { total: -1 } },
  ]);
  return {
    daily: rows,
    totals: totals.map((t) => ({
      username: t._id as string,
      total: Math.round(t.total * 100) / 100,
      count: t.count as number,
    })),
  };
}
