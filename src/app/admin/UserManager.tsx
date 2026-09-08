"use client";
import { useEffect, useState } from "react";

export default function UserManager() {
  const [users, setUsers] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [msg, setMsg] = useState<{ text: string; err: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/users");
    if (res.ok) setUsers((await res.json()).users ?? []);
  }
  useEffect(() => {
    let on = true;
    (async () => {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const u = (await res.json()).users ?? [];
        if (on) setUsers(u);
      }
    })();
    return () => {
      on = false;
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
      if (res.ok) setMsg({ text: `Sync done: ${JSON.stringify(data.synced ?? {})}`, err: false });
      else setMsg({ text: data.error === "Unauthorized" ? "Unauthorized — login again" : "Sync failed", err: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4">
      <h2 className="text-lg font-semibold">Tracked users</h2>
      <ul className="mt-2 space-y-1">
        {users.map((u) => (
          <li
            key={u}
            className="flex items-center justify-between border rounded p-2 text-sm"
          >
            <span className="break-all">{u}</span>
            <button
              onClick={() => remove(u)}
              disabled={busy}
              className="text-red-600 text-sm disabled:text-gray-400"
            >
              Remove
            </button>
          </li>
        ))}
        {users.length === 0 && (
          <li className="text-gray-500 text-sm">
            No users tracked yet — add the first below.
          </li>
        )}
      </ul>
      <form onSubmit={add} className="mt-3 flex flex-col sm:flex-row gap-2">
        <input
          className="border rounded p-2 flex-1 text-sm"
          placeholder="leetcode username"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          disabled={busy}
          className="rounded bg-black text-white px-4 py-2 text-sm disabled:bg-gray-400"
        >
          {busy ? "…" : "Add"}
        </button>
      </form>
      <button
        onClick={sync}
        disabled={busy}
        className="mt-4 rounded bg-black text-white px-4 py-2 text-sm disabled:bg-gray-400 w-full sm:w-auto"
      >
        {busy ? "Syncing…" : "Run sync now"}
      </button>
      {msg && (
        <p className={`text-sm mt-2 ${msg.err ? "text-red-600" : "text-gray-500"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
