"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr.buffer as ArrayBuffer;
}

export function NotifyToggle() {
  const [supported] = useState(
    () =>
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window
  );
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        setSubscribed(true);
        // Refresh stored keys on visit; server treats everything as per-sync.
        try {
          await fetch("/api/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint, keys: sub.toJSON().keys }),
          });
        } catch {
          /* empty */
        }
      }
    });
  }, [supported]);

  async function subscribe() {
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
          mode: "per-sync",
        }),
      });
      if (!save.ok) {
        setStatus("Subscribed in browser but server save failed — try again.");
        return;
      }
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

  if (!supported) return null;

  return (
    <Button
      variant="outline"
      size="icon"
      disabled={busy}
      onClick={subscribed ? unsubscribe : subscribe}
      title={status ?? (subscribed ? "Disable notifications" : "Enable notifications")}
    >
      {subscribed ? (
        <Bell className="h-4 w-4" />
      ) : (
        <BellOff className="h-4 w-4 text-muted-foreground" />
      )}
      <span className="sr-only">Notifications</span>
    </Button>
  );
}
