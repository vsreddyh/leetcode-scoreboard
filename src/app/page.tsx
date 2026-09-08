import Link from "next/link";

export default function Home() {
  return (
    <main className="max-w-xl mx-auto p-8 font-sans text-center">
      <h1 className="text-3xl font-bold">LeetCode Scoreboard</h1>
      <div className="mt-6 flex gap-3 justify-center">
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
