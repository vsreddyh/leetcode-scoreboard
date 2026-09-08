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

  async function loadUsers() {
    const res = await fetch("/api/admin/users");
    if (res.ok) setUsers((await res.json()).users ?? []);
  }

  async function loadSubs() {
    const res = await fetch("/api/admin/subs");
    if (res.ok) setSubs((await res.json()).subs ?? []);
  }

  useEffect(() => {
    loadUsers();
    loadSubs();
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
        setMsg({ text: `Sync done: ${JSON.stringify(data.synced ?? {})}`, err: false });
        loadSubs();
      } else {
        setMsg({
          text: data.error === "Unauthorized" ? "Unauthorized — login again" : "Sync failed",
          err: true,
        });
      }
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