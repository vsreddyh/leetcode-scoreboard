"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLogin() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) router.push("/admin");
    else setError("Invalid password");
  }

  return (
    <main className="max-w-sm mx-auto p-8 font-sans">
      <h1 className="text-2xl font-bold">Admin login</h1>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <input
          className="border rounded w-full p-2"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button className="rounded bg-black text-white px-4 py-2 w-full">Login</button>
      </form>
    </main>
  );
}
