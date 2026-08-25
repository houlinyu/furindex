"use client";

import { useEffect } from "react";

/**
 * Registers the service worker so FurIndex is installable to the home screen
 * and survives a dropped connection with a graceful offline notice. It caches
 * nothing but that notice (see public/sw.js), so it can never serve a stale
 * health record.
 */
export default function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const register = () =>
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* installability is a bonus; a failure must not break the app */
      });
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
