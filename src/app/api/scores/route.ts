import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Submission } from "@/models/Submission";

// GET /api/scores — score stored per question (one doc per user+titleSlug).
// Defensive $group first so legacy per-submission docs don't double-count.
const DEDUPE = {
  $group: {
    _id: { username: "$username", titleSlug: "$titleSlug" },
    date: { $min: "$date" },
    score: { $first: "$score" },
  },
};

export async function GET() {
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
    username: d._id.username,
    date: d._id.date,
    total: Math.round(d.total * 100) / 100,
    count: d.count,
  }));
  const totals = await Submission.aggregate([
    { $match: { status: "Accepted" } },
    DEDUPE,
    { $group: { _id: "$_id.username", total: { $sum: "$score" }, count: { $sum: 1 } } },
  ]);
  return NextResponse.json({ daily: rows, totals });
}
