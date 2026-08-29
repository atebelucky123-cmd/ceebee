import type { Metadata } from "next";
import "./globals.css";
import RegisterServiceWorker from "./register-sw";

export const metadata: Metadata = {
  title: "CeeBee",
  description: "Your personal AI assistant for email, calendar, and reminders.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CeeBee",
  },
};

export const viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="min-h-full flex flex-col bg-neutral-950 text-neutral-100">
        <RegisterServiceWorker />
        {children}
      </body>
    </html>
  );
}
