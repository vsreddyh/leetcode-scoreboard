"use client";
import { useEffect, useState } from "react";

export default function UserManager() {
  const [users, setUsers] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    const res = await fetch("/api/admin/users");
    if (res.ok) setUsers((await res.json()).users ?? []);
  }
  useEffect(() => { load(); }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: input }),
    });
    const data = await res.json();
    if (res.ok) { setUsers(data.users); setInput(""); }
    else setMsg(data.error ?? "Failed");
  }

  async function remove(u: string) {
    const res = await fetch(`/api/admin/users?username=${encodeURIComponent(u)}`, { method: "DELETE" });
    if (res.ok) setUsers((await res.json()).users ?? []);
  }

  async function sync() {
    setMsg("Syncing...");
    const res = await fetch("/api/sync", { method: "POST" });
    setMsg(res.ok ? "Sync done" : "Sync failed (rate limit?)");
  }

  return (
    <div className="mt-4">
      <h2 className="text-lg font-semibold">Tracked users</h2>
      <ul className="mt-2 space-y-1">
        {users.map((u) => (
          <li key={u} className="flex items-center justify-between border rounded p-2 text-sm">
            <span>{u}</span>
            <button onClick={() => remove(u)} className="text-red-600 text-sm">Remove</button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-3 flex gap-2">
        <input
          className="border rounded p-2 flex-1 text-sm"
          placeholder="leetcode username"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button className="rounded bg-black text-white px-4 py-2 text-sm">Add</button>
      </form>
      <button onClick={sync} className="mt-4 rounded bg-black text-white px-4 py-2 text-sm">
        Run sync now (every 5 min via cron too)
      </button>
      {msg && <p className="text-sm text-gray-500 mt-2">{msg}</p>}
    </div>
  );
}
