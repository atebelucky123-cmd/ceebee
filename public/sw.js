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

// Displays the actual notification when a push arrives (reminders/tasks).
self.addEventListener("push", (event) => {
  let data = { title: "CeeBee", body: "You have a reminder." };
  try {
    data = event.data.json();
  } catch {
    // fall back to default above if payload isn't JSON
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
    })
  );
});

// Tapping the notification focuses/opens CeeBee's dashboard.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow("/dashboard"));
});
