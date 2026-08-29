"use client";

import { useEffect } from "react";

// Registers the service worker so the browser recognizes CeeBee as
// installable (Add to Home Screen on mobile, install icon on desktop).
export default function RegisterServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.error("Service worker registration failed:", err);
      });
    }
  }, []);

  return null;
}
