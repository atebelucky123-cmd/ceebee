import { NextRequest, NextResponse } from "next/server";

// Open-Meteo is free and requires no API key. Defaults to Lagos if no
// coordinates are passed (e.g. browser geolocation was denied).
const DEFAULT_LAT = 6.5244;
const DEFAULT_LON = 3.3792;

const WEATHER_CODES: Record<number, string> = {
  0: "Clear sky",
  1: "Mostly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Fog",
  51: "Light drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  80: "Rain showers",
  95: "Thunderstorm",
};

export async function GET(req: NextRequest) {
  const lat = req.nextUrl.searchParams.get("lat") ?? DEFAULT_LAT.toString();
  const lon = req.nextUrl.searchParams.get("lon") ?? DEFAULT_LON.toString();

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    return NextResponse.json({
      currentTemp: Math.round(data.current.temperature_2m),
      condition: WEATHER_CODES[data.current.weather_code] ?? "Unknown",
      high: Math.round(data.daily.temperature_2m_max[0]),
      low: Math.round(data.daily.temperature_2m_min[0]),
    });
  } catch {
    return NextResponse.json(
      { error: "Couldn't fetch weather" },
      { status: 500 }
    );
  }
}
