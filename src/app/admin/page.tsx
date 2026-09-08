import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, verifySession } from "@/lib/admin";
import { connectDB } from "@/lib/db";
import { Submission } from "@/models/Submission";
import UserManager from "./UserManager";

export const dynamic = "force-dynamic";

export default async function Admin() {
  const user = await verifySession((await cookies()).get(ADMIN_COOKIE)?.value);
  if (!user) redirect("/admin/login");
  await connectDB().catch(() => {});
  const subs = await Submission.find()
    .sort({ timestamp: -1 })
    .limit(50)
    .lean()
    .catch(() => []);

  return (
    <main className="px-4 py-6 sm:px-8 max-w-4xl mx-auto w-full">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-bold">Admin (protected)</h1>
        <form action="/api/admin/logout" method="post">
          <button formMethod="post" className="border rounded px-3 py-1 text-sm">
            Logout
          </button>
        </form>
      </div>
      <p className="text-sm text-gray-500 mt-1">
        Manage tracked users. Auto-sync every 5 min via cron; rates refresh EOD IST.
      </p>
      <UserManager />
      <h2 className="text-lg font-semibold mt-8">Latest 50 submissions in DB</h2>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-sm border whitespace-nowrap min-w-[520px]">
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
            {(subs as Array<Record<string, unknown>>).length === 0 && (
              <tr>
                <td className="border p-2 text-gray-500" colSpan={5}>
                  Nothing yet — run sync.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
