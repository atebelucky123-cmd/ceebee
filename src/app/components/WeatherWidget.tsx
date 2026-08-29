"use client";

import { useEffect, useState } from "react";

type Weather = {
  currentTemp: number;
  condition: string;
  high: number;
  low: number;
};

export default function WeatherWidget() {
  const [weather, setWeather] = useState<Weather | null>(null);
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
        () => fetchWeather(), // denied/unavailable -- falls back to Lagos
        { timeout: 5000 }
      );
    } else {
      fetchWeather();
    }
  }, []);

  if (loading) {
    return (
      <div className="bg-neutral-900 rounded-2xl p-4 text-sm text-neutral-500">
        Loading weather…
      </div>
    );
  }

  if (!weather) return null;

  return (
    <div className="bg-neutral-900 rounded-2xl p-4 flex items-center justify-between">
      <div>
        <div className="text-2xl font-semibold">{weather.currentTemp}°C</div>
        <div className="text-sm text-neutral-400">{weather.condition}</div>
      </div>
      <div className="text-right text-sm text-neutral-400">
        <div>H: {weather.high}°</div>
        <div>L: {weather.low}°</div>
      </div>
    </div>
  );
}
