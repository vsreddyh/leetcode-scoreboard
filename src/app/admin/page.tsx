import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, verifySession } from "@/lib/admin";
import { connectDB } from "@/lib/db";
import { Submission } from "@/models/Submission";
import UserManager from "./UserManager";

export default async function Admin() {
  const user = verifySession((await cookies()).get(ADMIN_COOKIE)?.value);
  if (!user) redirect("/admin/login");
  await connectDB().catch(() => {});
  const subs = await Submission.find()
    .sort({ timestamp: -1 })
    .limit(50)
    .lean()
    .catch(() => []);

  return (
    <main className="max-w-4xl mx-auto p-8 font-sans">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin (protected)</h1>
        <form action="/api/admin/logout" method="post">
          <button formMethod="post" className="border rounded px-3 py-1 text-sm">
            Logout
          </button>
        </form>
      </div>
      <p className="text-sm text-gray-500 mt-1">
        Manage tracked users. Auto-sync runs every 5 min via Vercel Cron.
      </p>
      <UserManager />
      <h2 className="text-lg font-semibold mt-8">Latest 50 submissions in DB</h2>
      <table className="mt-2 w-full text-sm border">
        <thead>
          <tr className="bg-gray-100">
            <th className="border p-2 text-left">Date</th>
            <th className="border p-2 text-left">User</th>
            <th className="border p-2 text-left">Problem</th>
            <th className="border p-2 text-left">Status</th>
            <th className="border p-2 text-right">Score</th>
          </tr>
        </thead>
        <tbody>
          {(subs as Array<Record<string, unknown>>).map((s) => (
            <tr key={String(s._id)}>
              <td className="border p-2">{String(s.date)}</td>
              <td className="border p-2">{String(s.username)}</td>
              <td className="border p-2">{String(s.title)}</td>
              <td className="border p-2">{String(s.status)}</td>
              <td className="border p-2 text-right">{String(s.score)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
