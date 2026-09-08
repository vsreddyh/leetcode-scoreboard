"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLogin() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.push("/admin");
        router.refresh();
      } else setError("Invalid password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="max-w-sm w-full mx-auto px-4 py-10 font-sans">
      <h1 className="text-2xl font-bold">Admin login</h1>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <input
          className="border rounded w-full p-2"
          placeholder="Password"
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button disabled={busy} className="rounded bg-black text-white px-4 py-2 w-full disabled:bg-gray-400">
          {busy ? "Logging in…" : "Login"}
        </button>
      </form>
      <p className="text-xs text-gray-500 mt-4 text-center">
        <a href="/dashboard" className="underline">← Back to dashboard</a>
      </p>
    </main>
  );
}
