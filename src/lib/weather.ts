// Open-Meteo is free and requires no API key. Defaults to Lagos if no
// coordinates are passed (e.g. browser geolocation was denied).
export const DEFAULT_LAT = 6.5244;
export const DEFAULT_LON = 3.3792;

// Full WMO weather interpretation codes, as used by Open-Meteo.
// https://open-meteo.com/en/docs -- "WMO Weather interpretation codes"
export const WEATHER_CODES: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snow",
  73: "Moderate snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Thunderstorm with heavy hail",
};

export function describeWeatherCode(code: number): string {
  return WEATHER_CODES[code] ?? "Unsettled";
}

export type FullWeatherData = {
  currentTemp: number;
  condition: string;
  humidity: number;
  windSpeed: number;
  precipChance: number;
  high: number;
  low: number;
  hourly: { time: string; temp: number; condition: string; precipChance: number }[];
  daily: { date: string; high: number; low: number; condition: string; precipChance: number }[];
};

export async function fetchWeather(
  lat: number = DEFAULT_LAT,
  lon: number = DEFAULT_LON
): Promise<FullWeatherData> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m,precipitation_probability` +
    `&hourly=temperature_2m,weather_code,precipitation_probability` +
    `&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max` +
    `&timezone=auto&forecast_days=7`;

  const res = await fetch(url);
  if (!res.ok) {
    // Open-Meteo returns a JSON error body (e.g. bad params, rate limit) on
    // non-200s -- surfacing a clear error here means the API route returns
    // a real "couldn't fetch weather" instead of crashing on an assumption
    // about the response shape a few lines below.
    throw new Error(`Weather service returned ${res.status}`);
  }

  const data = await res.json();
  if (!data?.current || !data?.hourly || !data?.daily) {
    throw new Error("Weather service returned an unexpected response");
  }

  const nowIndex = data.hourly.time.findIndex(
    (t: string) => new Date(t).getTime() >= Date.now()
  );
  const hourlySlice = <T,>(arr: T[]) => arr.slice(nowIndex, nowIndex + 24);

  return {
    currentTemp: Math.round(data.current.temperature_2m),
    condition: describeWeatherCode(data.current.weather_code),
    humidity: data.current.relative_humidity_2m,
    windSpeed: Math.round(data.current.wind_speed_10m),
    precipChance: data.current.precipitation_probability,
    high: Math.round(data.daily.temperature_2m_max[0]),
    low: Math.round(data.daily.temperature_2m_min[0]),
    hourly: (hourlySlice(data.hourly.time) as string[]).map((time, i) => ({
      time,
      temp: Math.round(hourlySlice(data.hourly.temperature_2m)[i] as number),
      condition: describeWeatherCode(
        hourlySlice(data.hourly.weather_code)[i] as number
      ),
      precipChance: hourlySlice(data.hourly.precipitation_probability)[i] as number,
    })),
    daily: (data.daily.time as string[]).map((date, i) => ({
      date,
      high: Math.round(data.daily.temperature_2m_max[i]),
      low: Math.round(data.daily.temperature_2m_min[i]),
      condition: describeWeatherCode(data.daily.weather_code[i]),
      precipChance: data.daily.precipitation_probability_max[i],
    })),
  };
}
