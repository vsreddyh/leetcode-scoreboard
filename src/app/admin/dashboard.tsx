"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { useRouter } from "next/navigation";

interface Sub {
  _id: string;
  date: string;
  username: string;
  title: string;
  titleSlug: string;
  status: string;
  score: number;
  difficulty?: string | null;
  acRate?: number | null;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [users, setUsers] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [msg, setMsg] = useState<{ text: string; err: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmClearPush, setConfirmClearPush] = useState(false);

  async function loadSubs() {
    const res = await fetch("/api/admin/subs");
    if (res.ok) setSubs((await res.json()).subs ?? []);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [usersRes, subsRes] = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/admin/subs"),
      ]);
      if (cancelled) return;
      if (usersRes.ok) setUsers((await usersRes.json()).users ?? []);
      if (subsRes.ok) setSubs((await subsRes.json()).subs ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: input }),
      });
      const data = await res.json();
      if (res.ok) {
        setUsers(data.users);
        setInput("");
      } else setMsg({ text: data.error ?? "Failed", err: true });
    } finally {
      setBusy(false);
    }
  }

  async function remove(u: string) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users?username=${encodeURIComponent(u)}`, {
        method: "DELETE",
      });
      if (res.ok) setUsers((await res.json()).users ?? []);
      else setMsg({ text: "Remove failed", err: true });
    } finally {
      setBusy(false);
    }
  }

  async function sync() {
    if (busy) return;
    setBusy(true);
    setMsg({ text: "Syncing… (may take up to a minute)", err: false });
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const n = data.notify as { sent?: number; failed?: number; subs?: number; cleaned?: number; errors?: string[] } | undefined;
        const notifyStr = n
          ? `, notify: ${n.sent ?? 0} sent / ${n.failed ?? 0} failed (${n.subs ?? 0} subs${(n.cleaned ?? 0) > 0 ? `, ${n.cleaned} dead removed` : ""})${(n.errors?.length ?? 0) > 0 ? ` — ${n.errors!.join("; ")}` : ""}`
          : "";
        const errStr = data.errors && Object.keys(data.errors).length > 0
          ? `, errors: ${Object.entries(data.errors).map(([u, e]) => `${u}: ${e}`).join("; ")}`
          : "";
        const warnStr = data.warnings?.length ? ` — ${data.warnings.join("; ")}` : "";
        setMsg({ text: `Sync done: ${JSON.stringify(data.synced ?? {})}${errStr}${notifyStr}${warnStr}`, err: Object.keys(data.errors ?? {}).length > 0 });
        loadSubs();
      } else {
        setMsg({
          text: data.error === "Unauthorized" ? "Unauthorized — login again" : `Sync failed: ${data.error ?? `HTTP ${res.status}`}`,
          err: true,
        });
      }
    } finally {
      setBusy(false);
    }
  }

  async function testNotify() {
    if (busy) return;
    setBusy(true);
    setMsg({ text: "Sending test notification to all subscribers…", err: false });
    try {
      const res = await fetch("/api/notify-test", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg({ text: `Test: ${data.sent ?? 0} sent / ${data.failed ?? 0} failed (${data.subs ?? 0} subs${(data.cleaned ?? 0) > 0 ? `, ${data.cleaned} dead removed` : ""})${(data.errors?.length ?? 0) > 0 ? ` — ${data.errors.join("; ")}` : ""}`, err: (data.failed ?? 0) > 0 });
      } else {
        setMsg({ text: `Test failed: ${data.error ?? "unknown error"} — check VAPID env vars on the server.`, err: true });
      }
    } finally {
      setBusy(false);
    }
  }

  async function diagnose() {
    if (busy) return;
    setBusy(true);
    setMsg({ text: "Checking server config, database, and LeetCode…", err: false });
    try {
      const res = await fetch("/api/admin/status");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ text: `Diagnose failed: ${data.error ?? `HTTP ${res.status}`}`, err: true });
        return;
      }
      const envBad = Object.entries(data.env ?? {})
        .filter(([, v]) => !v)
        .map(([k]) => k);
      setMsg({
        text: `Diagnose — env missing: ${envBad.length ? envBad.join(", ") : "none"}; db: ${data.db?.ok ? "ok" : `FAIL (${data.db?.error ?? "unknown"})`}; users: ${JSON.stringify(data.users ?? [])}${data.usersError ? ` (err: ${data.usersError})` : ""}; leetcode probe: ${data.leetcode ? (data.leetcode.ok ? `ok (${data.leetcode.count} recents)` : `FAIL (${data.leetcode.error})`) : "skipped (no users)"}`,
        err: !data.db?.ok || (data.leetcode != null && !data.leetcode.ok),
      });
    } finally {
      setBusy(false);
    }
  }

  async function clearPushSubs() {
    if (!confirmClearPush) {
      setConfirmClearPush(true);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/notify-test", { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg({ text: `Removed ${data.deleted ?? 0} push subscription(s). Users must re-enable notifications.`, err: false });
      } else {
        setMsg({ text: `Clear failed: ${data.error ?? "unknown error"}`, err: true });
      }
      setConfirmClearPush(false);
    } finally {
      setBusy(false);
    }
  }

  async function clearAll() {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/clear", { method: "DELETE" });
      const data = await res.json();
      setMsg({ text: `Cleared ${data.deleted ?? 0} records. Run sync to repopulate.`, err: false });
      setSubs([]);
      setConfirmClear(false);
    } finally {
      setBusy(false);
    }
  }

  const diffColor: Record<string, string> = {
    Easy: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
    Medium: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    Hard: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  };

  return (
    <div className="flex-1 px-4 py-6 sm:px-8 max-w-5xl mx-auto w-full">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">Admin</h1>
        <div className="flex gap-2 items-center">
          <Button variant="outline" size="sm" onClick={() => router.push("/dashboard")}>
            Dashboard
          </Button>
          <ThemeToggle />
          <form action="/api/admin/logout" method="post">
            <Button formMethod="post" variant="outline" size="sm">Logout</Button>
          </form>
        </div>
      </div>
      <p className="text-sm text-muted-foreground mt-1">
        Manage tracked users. Sync runs every 5 min via cron.
      </p>

      <Separator className="my-6" />

      {/* Tracked users */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tracked users</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {users.map((u) => (
              <div key={u} className="flex items-center justify-between border rounded-md px-3 py-2">
                <span className="text-sm font-medium break-all">{u}</span>
                <Button variant="ghost" size="sm" onClick={() => remove(u)} disabled={busy}>
                  Remove
                </Button>
              </div>
            ))}
            {users.length === 0 && (
              <p className="text-sm text-muted-foreground">No users tracked yet.</p>
            )}
          </div>
          <form onSubmit={add} className="mt-3 flex flex-col sm:flex-row gap-2">
            <Input
              placeholder="leetcode username"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <Button type="submit" disabled={busy} className="shrink-0">
              {busy ? "…" : "Add"}
            </Button>
          </form>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={sync} disabled={busy}>
              {busy ? "Syncing…" : "Run sync now"}
            </Button>
            <Button variant="outline" onClick={diagnose} disabled={busy}>
              Diagnose
            </Button>
            <Button variant="outline" onClick={testNotify} disabled={busy}>
              Send test notification
            </Button>
            <Button
              variant={confirmClearPush ? "destructive" : "outline"}
              onClick={clearPushSubs}
              disabled={busy}
            >
              {confirmClearPush ? "Confirm clear push subs?" : "Clear push subscriptions"}
            </Button>
            <Button
              variant={confirmClear ? "destructive" : "outline"}
              onClick={clearAll}
              disabled={busy}
            >
              {confirmClear ? "Confirm clear all?" : "Clear all data"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {msg && (
        <p className={`text-sm mt-3 ${msg.err ? "text-destructive" : "text-muted-foreground"}`}>
          {msg.text}
        </p>
      )}

      <Separator className="my-6" />

      {/* Recent submissions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent submissions in DB</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Problem</TableHead>
                  <TableHead>Difficulty</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subs.map((s) => (
                  <TableRow key={s._id}>
                    <TableCell>{s.date}</TableCell>
                    <TableCell>{s.username}</TableCell>
                    <TableCell>
                      <a
                        href={`https://leetcode.com/problems/${s.titleSlug}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline underline-offset-2 hover:text-primary/80"
                      >
                        {s.title}
                      </a>
                    </TableCell>
                    <TableCell>
                      {s.difficulty ? (
                        <Badge variant="secondary" className={diffColor[s.difficulty] ?? ""}>
                          {s.difficulty}
                        </Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-semibold">{s.score}</TableCell>
                  </TableRow>
                ))}
                {subs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No data yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}