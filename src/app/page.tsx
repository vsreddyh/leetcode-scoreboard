import Link from "next/link";

export default function Home() {
  return (
    <main className="max-w-xl w-full mx-auto px-4 py-10 font-sans text-center">
      <h1 className="text-3xl font-bold">LeetCode Scoreboard</h1>
      <p className="text-sm text-gray-500 mt-2">
        Score per Accepted problem = 100 − acceptance rate. Daily sum per user (IST).
      </p>
      <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center items-stretch sm:items-center">
        <Link href="/dashboard" className="rounded bg-black text-white px-4 py-2 text-sm">
          Public dashboard
        </Link>
        <Link href="/admin" className="border rounded px-4 py-2 text-sm">
          Admin (protected)
        </Link>
      </div>
    </main>
  );
}
