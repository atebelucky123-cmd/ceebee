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

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m,precipitation_probability` +
    `&hourly=temperature_2m,weather_code,precipitation_probability` +
    `&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max` +
    `&timezone=auto&forecast_days=7`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    // Trim hourly data to the next 24 hours from "now" rather than
    // returning the full 7-day hourly array.
    const nowIndex = data.hourly.time.findIndex(
      (t: string) => new Date(t).getTime() >= Date.now()
    );
    const hourlySlice = <T,>(arr: T[]) => arr.slice(nowIndex, nowIndex + 24);

    return NextResponse.json({
      currentTemp: Math.round(data.current.temperature_2m),
      condition: WEATHER_CODES[data.current.weather_code] ?? "Unknown",
      humidity: data.current.relative_humidity_2m,
      windSpeed: Math.round(data.current.wind_speed_10m),
      precipChance: data.current.precipitation_probability,
      high: Math.round(data.daily.temperature_2m_max[0]),
      low: Math.round(data.daily.temperature_2m_min[0]),
      hourly: (hourlySlice(data.hourly.time) as string[]).map((time, i) => ({
        time,
        temp: Math.round(hourlySlice(data.hourly.temperature_2m)[i] as number),
        condition:
          WEATHER_CODES[hourlySlice(data.hourly.weather_code)[i] as number] ??
          "Unknown",
        precipChance: hourlySlice(data.hourly.precipitation_probability)[i],
      })),
      daily: data.daily.time.map((date: string, i: number) => ({
        date,
        high: Math.round(data.daily.temperature_2m_max[i]),
        low: Math.round(data.daily.temperature_2m_min[i]),
        condition: WEATHER_CODES[data.daily.weather_code[i]] ?? "Unknown",
        precipChance: data.daily.precipitation_probability_max[i],
      })),
    });
  } catch {
    return NextResponse.json(
      { error: "Couldn't fetch weather" },
      { status: 500 }
    );
  }
}
