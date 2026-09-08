import { connectDB } from "@/lib/db";
import { TrackedUser } from "@/models/TrackedUser";

export async function getTrackedUsernames(): Promise<string[]> {
  await connectDB();
  const docs = await TrackedUser.find().lean();
  return docs.map((d) => (d as { username: string }).username);
}
