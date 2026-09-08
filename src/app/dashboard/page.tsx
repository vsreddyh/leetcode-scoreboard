async function getScores() {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  try {
    const res = await fetch(`${base}/api/scores`, { cache: "no-store" });
    if (!res.ok) return { daily: [], totals: [] };
    return res.json();
  } catch {
    return { daily: [], totals: [] };
  }
}

export default async function Dashboard() {
  const { daily, totals } = (await getScores()) as {
    daily: { username: string; date: string; total: number; count: number }[];
    totals: { _id: string; total: number; count: number }[];
  };

  return (
    <main className="max-w-3xl mx-auto p-8 font-sans">
      <h1 className="text-3xl font-bold">Scoreboard (public)</h1>
      <p className="text-sm text-gray-500 mt-1">
        Score per Accepted problem = 100 − acceptance rate. Daily score = sum per day (UTC).
        Auto-synced every 5 min.
      </p>
      <h2 className="text-xl font-semibold mt-8">Totals</h2>
      <ul className="mt-2 space-y-1">
        {totals.map((t) => (
          <li key={t._id} className="border rounded p-2">
            <b>{t._id}</b>: {Math.round(t.total * 100) / 100} pts ({t.count} accepted)
          </li>
        ))}
        {totals.length === 0 && <li className="text-gray-500">No data yet.</li>}
      </ul>
      <h2 className="text-xl font-semibold mt-8">Daily scores</h2>
      <table className="mt-2 w-full text-sm border">
        <thead>
          <tr className="bg-gray-100">
            <th className="border p-2 text-left">Date</th>
            <th className="border p-2 text-left">User</th>
            <th className="border p-2 text-right">Score</th>
            <th className="border p-2 text-right">Solved</th>
          </tr>
        </thead>
        <tbody>
          {daily.map((d) => (
            <tr key={`${d.date}-${d.username}`}>
              <td className="border p-2">{d.date}</td>
              <td className="border p-2">{d.username}</td>
              <td className="border p-2 text-right">{d.total}</td>
              <td className="border p-2 text-right">{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
