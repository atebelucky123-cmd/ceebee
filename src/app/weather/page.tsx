"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type HourlyEntry = {
  time: string;
  temp: number;
  condition: string;
  precipChance: number;
};

type DailyEntry = {
  date: string;
  high: number;
  low: number;
  condition: string;
  precipChance: number;
};

type FullWeather = {
  currentTemp: number;
  condition: string;
  humidity: number;
  windSpeed: number;
  precipChance: number;
  high: number;
  low: number;
  hourly: HourlyEntry[];
  daily: DailyEntry[];
};

function dayLabel(dateStr: string, index: number) {
  if (index === 0) return "Today";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { weekday: "short" });
}

function hourLabel(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-US", { hour: "numeric", hour12: true });
}

export default function WeatherPage() {
  const [weather, setWeather] = useState<FullWeather | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    function fetchWeather(lat?: number, lon?: number) {
      const params = new URLSearchParams();
      if (lat !== undefined && lon !== undefined) {
        params.set("lat", lat.toString());
        params.set("lon", lon.toString());
      }
      fetch(`/api/weather?${params.toString()}`)
        .then((res) => res.json())
        .then((data) => {
          if (!data.error) setWeather(data);
        })
        .finally(() => setLoading(false));
    }

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => fetchWeather(pos.coords.latitude, pos.coords.longitude),
        () => fetchWeather(),
        { timeout: 5000 }
      );
    } else {
      fetchWeather();
    }
  }, []);

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full overflow-y-auto">
      <header className="px-4 py-3 border-b border-neutral-800 flex items-center gap-3">
        <Link
          href="/dashboard"
          className="bg-amber-400 text-neutral-950 text-xs font-medium px-3 py-1.5 rounded-full"
        >
          Back
        </Link>
        <h1 className="font-semibold text-lg">Weather</h1>
      </header>

      <main className="flex-1 px-4 py-4 space-y-4">
        {loading ? (
          <div className="text-neutral-500 text-sm text-center py-8">
            Loading…
          </div>
        ) : !weather ? (
          <div className="text-neutral-500 text-sm text-center py-8">
            Couldn&apos;t load weather.
          </div>
        ) : (
          <>
            {/* Current conditions */}
            <div className="bg-neutral-900 rounded-2xl p-6 text-center">
              <div className="text-5xl font-bold">{weather.currentTemp}°C</div>
              <div className="text-neutral-400 mt-1">{weather.condition}</div>
              <div className="text-sm text-neutral-500 mt-1">
                H: {weather.high}° L: {weather.low}°
              </div>
              <div className="flex justify-center gap-6 mt-4 text-xs text-neutral-400">
                <div>
                  <div className="text-neutral-600">Humidity</div>
                  <div className="font-medium text-neutral-200">
                    {weather.humidity}%
                  </div>
                </div>
                <div>
                  <div className="text-neutral-600">Wind</div>
                  <div className="font-medium text-neutral-200">
                    {weather.windSpeed} km/h
                  </div>
                </div>
                <div>
                  <div className="text-neutral-600">Rain chance</div>
                  <div className="font-medium text-neutral-200">
                    {weather.precipChance}%
                  </div>
                </div>
              </div>
            </div>

            {/* Hourly strip */}
            <div>
              <h3 className="text-xs uppercase text-neutral-500 font-medium px-1 mb-2">
                Next 24 Hours
              </h3>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {weather.hourly.map((h, i) => (
                  <div
                    key={h.time}
                    className="flex flex-col items-center gap-1 bg-neutral-900 rounded-xl px-3 py-3 shrink-0 min-w-[76px]"
                  >
                    <span className="text-xs text-neutral-500">
                      {i === 0 ? "Now" : hourLabel(h.time)}
                    </span>
                    <span className="text-sm font-semibold">{h.temp}°</span>
                    <span className="text-[10px] text-neutral-400 text-center leading-tight">
                      {h.condition}
                    </span>
                    <span className="text-[10px] text-amber-400">
                      {h.precipChance}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 7-day outlook */}
            <div>
              <h3 className="text-xs uppercase text-neutral-500 font-medium px-1 mb-2">
                7-Day Outlook
              </h3>
              <div className="bg-neutral-900 rounded-2xl divide-y divide-neutral-800">
                {weather.daily.map((d, i) => (
                  <div
                    key={d.date}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <span className="text-sm w-16">{dayLabel(d.date, i)}</span>
                    <span className="text-xs text-neutral-500 flex-1 text-center">
                      {d.condition}
                    </span>
                    <span className="text-xs text-neutral-500 w-10 text-right">
                      {d.precipChance}%
                    </span>
                    <span className="text-sm w-20 text-right">
                      {d.high}° <span className="text-neutral-500">{d.low}°</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
