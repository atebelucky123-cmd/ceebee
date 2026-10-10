import type { Metadata } from "next";
import { Bricolage_Grotesque, Figtree, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import RegisterServiceWorker from "./register-sw";
import AppShell from "./components/AppShell";

// Hive type system: Bricolage Grotesque for headlines/greetings, Figtree for
// UI and chat, JetBrains Mono for times, temperatures and counts.
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap" });
const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], weight: ["500"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: "CeeBee",
  description: "Busy days, handled. Your personal assistant for email, calendar, and reminders.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CeeBee",
  },
};

export const viewport = {
  themeColor: "#12100D",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`h-full antialiased ${bricolage.variable} ${figtree.variable} ${jetbrains.variable}`}>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/icon-32.png" type="image/png" sizes="32x32" />
        <link rel="apple-touch-icon" href="/icon-180.png" />
      </head>
      {/*
        h-dvh pins the body to the actual viewport height (including on
        mobile where browser chrome shows/hides), so only the inner content
        areas scroll -- never the whole page dragging the nav out of view.
      */}
      <body className="h-dvh overflow-hidden bg-ground text-cream font-sans">
        <RegisterServiceWorker />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
