import type { Metadata } from "next";
import "./globals.css";
import RegisterServiceWorker from "./register-sw";
import BottomNav from "./components/BottomNav";

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
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/icon-32.png" type="image/png" sizes="32x32" />
        <link rel="apple-touch-icon" href="/icon-180.png" />
      </head>
      <body className="min-h-full flex flex-col bg-neutral-950 text-neutral-100">
        <RegisterServiceWorker />
        <div className="flex-1 min-h-0 flex flex-col max-w-2xl mx-auto w-full">
          {children}
        </div>
        <BottomNav />
      </body>
    </html>
  );
}
