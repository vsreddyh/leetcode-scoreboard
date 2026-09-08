import { connectDB } from "@/lib/db";
import { Submission } from "@/models/Submission";

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
  const docs = await Submission.find({ date, status: "Accepted" })
    .sort({ score: -1 })
    .lean();
  return docs.map((d) => ({
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