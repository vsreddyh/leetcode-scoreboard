import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Home() {
  return (
    <main className="flex-1 flex items-center justify-center px-4 py-10">
      <div className="max-w-md w-full text-center space-y-6">
        <h1 className="text-3xl font-bold">LeetCode Scoreboard</h1>
        <p className="text-muted-foreground text-sm">
          Score = 100 − acceptance rate per accepted question. Daily sum per user (IST).
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Dashboard
          </Link>
          <Link
            href="/admin"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            Admin
          </Link>
        </div>
        <div className="pt-2 flex justify-center">
          <ThemeToggle />
        </div>
      </div>
    </main>
  );
}