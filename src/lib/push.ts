import webpush from "web-push";
import { connectDB } from "@/lib/db";
import { PushSub } from "@/models/PushSub";

let configured = false;

function ensureConfig() {
  if (configured) return;
  const pub = process.env.VAPID_PUBLIC_KEY ?? "";
  const priv = process.env.VAPID_PRIVATE_KEY ?? "";
  const sub = process.env.VAPID_SUBJECT ?? "mailto:admin@example.com";
  if (!pub || !priv) throw new Error("VAPID keys not configured");
  webpush.setVapidDetails(sub, pub, priv);
  configured = true;
}

export interface NotifyPayload {
  title: string;
  body: string;
  url?: string;
}

type Mode = "per-sync" | "per-problem" | "twice-daily";

interface RawSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  mode?: Mode;
}

async function sendToSub(
  sub: RawSub,
  payload: NotifyPayload
): Promise<void> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: sub.keys },
      JSON.stringify(payload)
    );
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      await PushSub.deleteOne({ endpoint: sub.endpoint });
    }
  }
}

/** Current IST hour*60+minute. */
function istMinutesNow(): number {
  const now = new Date();
  const ist = new Date(now.getTime() + (5 * 60 + 30) * 60 * 1000);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

/** True if within ±5 min of 11:30 (690 min) or 23:30 (1410 min). */
function isDigestWindow(): boolean {
  const m = istMinutesNow();
  return Math.abs(m - 690) <= 5 || Math.abs(m - 1410) <= 5;
}

/**
 * Called after every sync. Sends:
 * - per-sync: one summary notification if any new solves
 * - per-problem: one notification per user with new solves
 * - twice-daily: digest only when within ±5 min of 11:30 AM/PM IST
 */
export async function notifyAfterSync(synced: Record<string, number>) {
  ensureConfig();
  await connectDB();
  const subs = (await PushSub.find().lean()) as unknown as RawSub[];
  if (subs.length === 0) return;

  const tasks: Promise<void>[] = [];

  // --- per-sync + per-problem: only when new solves ---
  const hasNew = Object.values(synced).some((n) => n > 0);
  if (hasNew) {
    const summaryParts: string[] = [];
    const detailParts: { user: string; count: number }[] = [];
    for (const [user, count] of Object.entries(synced)) {
      if (count > 0) {
        summaryParts.push(`${user}: ${count}`);
        detailParts.push({ user, count });
      }
    }

    const perSyncSubs = subs.filter((s) => s.mode === "per-sync");
    const perProblemSubs = subs.filter((s) => s.mode === "per-problem");

    if (perSyncSubs.length > 0) {
      const payload: NotifyPayload = {
        title: "LC Board — New solves!",
        body: summaryParts.join(", "),
        url: "/dashboard",
      };
      for (const sub of perSyncSubs) tasks.push(sendToSub(sub, payload));
    }

    if (perProblemSubs.length > 0) {
      for (const { user, count } of detailParts) {
        const payload: NotifyPayload = {
          title: `LC Board — ${user}`,
          body: `Solved ${count} new problem${count > 1 ? "s" : ""} today!`,
          url: "/dashboard",
        };
        for (const sub of perProblemSubs) tasks.push(sendToSub(sub, payload));
      }
    }
  }

  // --- twice-daily: send digest only during 11:30 AM/PM IST window ---
  if (isDigestWindow()) {
    const digestSubs = subs.filter((s) => s.mode === "twice-daily");
    if (digestSubs.length > 0) {
      const { getOverallScores } = await import("@/lib/scores");
      const totals = await getOverallScores();
      if (totals.length > 0) {
        const lines = totals.map(
          (t) => `${t.username}: ${t.total} pts (${t.count} problems)`
        );
        const payload: NotifyPayload = {
          title: "LC Board — Daily digest",
          body: lines.join(" | "),
          url: "/dashboard",
        };
        for (const sub of digestSubs) tasks.push(sendToSub(sub, payload));
      }
    }
  }

  if (tasks.length > 0) await Promise.allSettled(tasks);
}

export function getVapidPublicKey(): string {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? process.env.VAPID_PUBLIC_KEY ?? "";
}