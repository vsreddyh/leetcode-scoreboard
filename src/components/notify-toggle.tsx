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
  const [status, setStatus] = useState<string | null>(null);

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
    setStatus(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setStatus("Permission blocked — allow notifications in the browser site settings.");
        return;
      }
      // Ensure a service worker controls the page (needed for push).
      // navigator.serviceWorker.ready can hang forever if none is registered.
      if ("serviceWorker" in navigator && !(await navigator.serviceWorker.getRegistration())) {
        try {
          await navigator.serviceWorker.register("/sw.js");
        } catch {
          setStatus("Service worker registration failed.");
          return;
        }
      }
      const reg = await navigator.serviceWorker.ready;
      const res = await fetch("/api/subscribe");
      const { publicKey } = await res.json();
      if (!publicKey) {
        setStatus("Server has no VAPID public key configured.");
        return;
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const subJson = sub.toJSON();
      const save = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          keys: subJson.keys,
          mode: selectedMode,
        }),
      });
      if (!save.ok) {
        setStatus("Subscribed in browser but server save failed — try again.");
        return;
      }
      setMode(selectedMode);
      setSubscribed(true);
    } catch (e) {
      setStatus(e instanceof Error ? `Subscribe failed: ${e.message}` : "Subscribe failed.");
    } finally {
      setBusy(false);
    }
  }

  async function unsubscribe() {
    if (busy) return;
    setBusy(true);
    setStatus(null);
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
    } catch (e) {
      setStatus(e instanceof Error ? `Unsubscribe failed: ${e.message}` : "Unsubscribe failed.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    if (busy) return;
    setBusy(true);
    setStatus("Sending test…");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) {
        setStatus("No browser subscription — enable notifications first.");
        return;
      }
      const res = await fetch("/api/notify-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.sent > 0) {
        setStatus("Test sent — it should arrive in a few seconds. If not, check server VAPID keys.");
      } else if ((data.cleaned ?? 0) > 0) {
        // Push service rejected it as dead; server already deleted it.
        try {
          await sub.unsubscribe();
        } catch {
          /* already gone */
        }
        setSubscribed(false);
        setStatus("Your subscription was broken and has been removed — enable notifications again to resubscribe.");
      } else {
        setStatus(`Test failed: ${data.error ?? "unknown error"}. Check server VAPID keys.`);
      }
    } catch (e) {
      setStatus(e instanceof Error ? `Test failed: ${e.message}` : "Test failed.");
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
              <DropdownMenuItem onClick={sendTest} disabled={busy}>
                Send test notification
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={unsubscribe} disabled={busy}>
                Disable notifications
              </DropdownMenuItem>
            </DropdownMenuGroup>
            {status && (
              <>
                <DropdownMenuSeparator />
                <p className="px-2 py-1.5 text-xs text-muted-foreground">{status}</p>
              </>
            )}
          </>
        ) : (
          <>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Enable notifications</DropdownMenuLabel>
            {(Object.entries(MODE_LABELS) as [Mode, string][]).map(([key, label]) => (
              <DropdownMenuItem key={key} disabled={busy} onClick={() => subscribe(key)}>
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          {status && (
            <>
              <DropdownMenuSeparator />
              <p className="px-2 py-1.5 text-xs text-muted-foreground">{status}</p>
            </>
          )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}