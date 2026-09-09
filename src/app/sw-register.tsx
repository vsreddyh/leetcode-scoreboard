"use client";
import { useEffect } from "react";

export default function SWRegister() {
  useEffect(() => {
    // Register in all environments so push can be tested via `npm run dev`
    // as well as in production. The SW only caches same-origin GETs and
    // skips /api/*, so dev registration is safe.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
