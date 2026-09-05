import { NextRequest, NextResponse } from "next/server";
import { fetchWeather, DEFAULT_LAT, DEFAULT_LON } from "@/lib/weather";

export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get("lat") ?? DEFAULT_LAT);
  const lon = Number(req.nextUrl.searchParams.get("lon") ?? DEFAULT_LON);

  try {
    const data = await fetchWeather(lat, lon);
    return NextResponse.json(data);
  } catch (err) {
    // Previously swallowed silently -- a 500 with zero information in
    // Vercel's own function logs, so there was no way to tell whether
    // Open-Meteo was down, rate-limiting, or something else entirely.
    console.error("Weather route error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't fetch weather" },
      { status: 500 }
    );
  }
}
