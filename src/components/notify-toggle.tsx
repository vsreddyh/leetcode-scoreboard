"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Mode = "per-sync" | "per-problem" | "twice-daily";

const MODE_LABELS: Record<Mode, string> = {
  "per-sync": "Per sync (every 5 min)",
  "per-problem": "Per problem (every 5 min)",
  "twice-daily": "Twice daily (11:30 AM/PM IST)",
};

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr.buffer as ArrayBuffer;
}

export function NotifyToggle() {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [mode, setMode] = useState<Mode>("per-sync");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    setSupported(true);
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        setSubscribed(true);
        // Fetch current mode from server
        try {
          const res = await fetch("/api/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint, keys: sub.toJSON().keys }),
          });
          const data = await res.json();
          if (data.mode) setMode(data.mode);
        } catch {
          /* empty */
        }
      }
    });
  }, []);

  async function subscribe(selectedMode: Mode) {
    if (busy) return;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setBusy(false);
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const res = await fetch("/api/subscribe");
      const { publicKey } = await res.json();
      if (!publicKey) return;

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const subJson = sub.toJSON();
      await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          keys: subJson.keys,
          mode: selectedMode,
        }),
      });
      setMode(selectedMode);
      setSubscribed(true);
    } catch {
      /* empty */
    } finally {
      setBusy(false);
    }
  }

  async function unsubscribe() {
    if (busy) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch {
      /* empty */
    } finally {
      setBusy(false);
    }
  }

  if (!supported) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="icon" />}>
        {subscribed ? (
          <Bell className="h-4 w-4" />
        ) : (
          <BellOff className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="sr-only">Notifications</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {subscribed ? (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                Notifications: {MODE_LABELS[mode]}
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                Switch mode:
              </DropdownMenuLabel>
              {(Object.entries(MODE_LABELS) as [Mode, string][]).map(([key, label]) => (
                <DropdownMenuItem
                  key={key}
                  disabled={busy || key === mode}
                  onClick={() => subscribe(key)}
                >
                  {key === mode ? "✓ " : ""}{label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem variant="destructive" onClick={unsubscribe} disabled={busy}>
                Disable notifications
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        ) : (
          <DropdownMenuGroup>
            <DropdownMenuLabel>Enable notifications</DropdownMenuLabel>
            {(Object.entries(MODE_LABELS) as [Mode, string][]).map(([key, label]) => (
              <DropdownMenuItem key={key} disabled={busy} onClick={() => subscribe(key)}>
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}