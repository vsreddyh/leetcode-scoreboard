import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, verifySession } from "@/lib/admin";
import AdminDashboard from "./dashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await verifySession((await cookies()).get(ADMIN_COOKIE)?.value);
  if (!user) redirect("/admin/login");
  return <AdminDashboard />;
}