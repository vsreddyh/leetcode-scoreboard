import { getScores } from "@/lib/scores";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const { daily, totals } = await getScores().catch(() => ({ daily: [], totals: [] }));
  const leaders = totals.map((t) => ({ username: t.username, total: t.total }));
  const rank = (u: string) =>
    leaders.find((l) => l.username === u)?.total ?? 0;

  return (
    <main className="px-4 py-6 sm:px-8 max-w-3xl mx-auto w-full">
      <h1 className="text-2xl sm:text-3xl font-bold">Scoreboard</h1>
      <p className="text-sm text-gray-500 mt-1">
        Score per Accepted problem = 100 − acceptance rate. Daily score = sum per day (IST).
        Auto-synced every 5 min.
      </p>

      <h2 className="text-xl font-semibold mt-8">Totals</h2>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {totals.map((t, i) => (
          <div
            key={t.username}
            className={`border rounded p-4 ${i === 0 && t.total > 0 ? "border-yellow-400 bg-yellow-50" : ""}`}
          >
            <div className="flex justify-between items-baseline gap-2">
              <span className="font-semibold text-base">{t.username}</span>
              <span className="text-lg font-bold">{t.total}</span>
            </div>
            <p className="text-gray-500 text-xs mt-1">{t.count} problems solved</p>
          </div>
        ))}
        {totals.length === 0 && (
          <p className="text-gray-500 text-sm">No data yet.</p>
        )}
      </div>

      <h2 className="text-xl font-semibold mt-8">Daily scores (IST)</h2>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-sm border whitespace-nowrap min-w-[480px]">
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-2 text-left">Date</th>
              <th className="border p-2 text-left">User</th>
              <th className="border p-2 text-right">Score</th>
              <th className="border p-2 text-right">Solved</th>
              <th className="border p-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {daily.map((d) => (
              <tr key={`${d.date}-${d.username}`}>
                <td className="border p-2">{d.date}</td>
                <td className="border p-2">{d.username}</td>
                <td className="border p-2 text-right">{d.total}</td>
                <td className="border p-2 text-right">{d.count}</td>
                <td className="border p-2 text-right text-gray-500">{rank(d.username)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
