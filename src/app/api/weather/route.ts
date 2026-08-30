import { NextRequest, NextResponse } from "next/server";
import { fetchWeather, DEFAULT_LAT, DEFAULT_LON } from "@/lib/weather";

export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get("lat") ?? DEFAULT_LAT);
  const lon = Number(req.nextUrl.searchParams.get("lon") ?? DEFAULT_LON);

  try {
    const data = await fetchWeather(lat, lon);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Couldn't fetch weather" },
      { status: 500 }
    );
  }
}
