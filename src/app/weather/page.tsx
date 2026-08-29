"use client";

import Link from "next/link";
import WeatherWidget from "../components/WeatherWidget";

export default function WeatherPage() {
  return (
    <div className="flex flex-col flex-1 min-h-0 w-full overflow-y-auto">
      <header className="px-4 py-3 border-b border-neutral-800 flex items-center gap-3">
        <Link href="/dashboard" className="text-neutral-500 text-sm">
          ← Back
        </Link>
        <h1 className="font-semibold text-lg">Weather</h1>
      </header>

      <main className="flex-1 px-4 py-4">
        <WeatherWidget />
      </main>
    </div>
  );
}
