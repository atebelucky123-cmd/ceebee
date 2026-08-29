// Minimal service worker -- its mere presence (registered + active) is what
// makes Chrome/Edge/Safari treat this site as "installable" and show the
// Add to Home Screen / install icon. No offline caching logic yet -- that
// can be added later if you want CeeBee to work offline.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Pass-through for now -- no caching yet.
});
