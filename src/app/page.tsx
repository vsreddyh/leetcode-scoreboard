import type { Metadata } from "next";
import ScoreboardDashboard from "@/components/scoreboard-dashboard";

export const metadata: Metadata = {
  title: "Scoreboard",
  description: "Daily scores for tracked LeetCode users. Score = 100 − acceptance rate.",
};

export default function Home() {
  return <ScoreboardDashboard />;
}
