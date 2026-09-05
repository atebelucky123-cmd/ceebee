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

  // Open-Meteo is expected to return JSON on a 200 -- but under load or
  // abuse-rate-limiting it (or an intermediary proxy) can serve a plain
  // text/HTML response with a 200 status. res.json() would then throw a raw
  // "Unexpected token '<' is not valid JSON"-style SyntaxError, which used
  // to leak straight to the chat as unreadable gibberish. This gives a
  // clear, honest error instead.
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error("Weather service returned an unreadable response -- try again in a moment.");
  }
  if (
    !data ||
    typeof data !== "object" ||
    !("current" in data) ||
    !("hourly" in data) ||
    !("daily" in data)
  ) {
    throw new Error("Weather service returned an unexpected response");
  }
  // Shape confirmed above -- the fields' internal structure past this point
  // is still trusted from Open-Meteo's documented response, same as before.
  const weatherData = data as {
    current: { temperature_2m: number; weather_code: number; relative_humidity_2m: number; wind_speed_10m: number; precipitation_probability: number };
    hourly: { time: string[]; temperature_2m: number[]; weather_code: number[]; precipitation_probability: number[] };
    daily: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; weather_code: number[]; precipitation_probability_max: number[] };
  };

  const nowIndex = weatherData.hourly.time.findIndex(
    (t: string) => new Date(t).getTime() >= Date.now()
  );
  const hourlySlice = <T,>(arr: T[]) => arr.slice(nowIndex, nowIndex + 24);

  return {
    currentTemp: Math.round(weatherData.current.temperature_2m),
    condition: describeWeatherCode(weatherData.current.weather_code),
    humidity: weatherData.current.relative_humidity_2m,
    windSpeed: Math.round(weatherData.current.wind_speed_10m),
    precipChance: weatherData.current.precipitation_probability,
    high: Math.round(weatherData.daily.temperature_2m_max[0]),
    low: Math.round(weatherData.daily.temperature_2m_min[0]),
    hourly: hourlySlice(weatherData.hourly.time).map((time, i) => ({
      time,
      temp: Math.round(hourlySlice(weatherData.hourly.temperature_2m)[i]),
      condition: describeWeatherCode(
        hourlySlice(weatherData.hourly.weather_code)[i]
      ),
      precipChance: hourlySlice(weatherData.hourly.precipitation_probability)[i],
    })),
    daily: weatherData.daily.time.map((date, i) => ({
      date,
      high: Math.round(weatherData.daily.temperature_2m_max[i]),
      low: Math.round(weatherData.daily.temperature_2m_min[i]),
      condition: describeWeatherCode(weatherData.daily.weather_code[i]),
      precipChance: weatherData.daily.precipitation_probability_max[i],
    })),
  };
}
