import "server-only";

import { z } from "zod";

const FORECAST_WINDOW_MS = 16 * 24 * 60 * 60 * 1000;
const PUBLIC_GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const PUBLIC_FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const CUSTOMER_GEOCODING_URL = "https://customer-geocoding-api.open-meteo.com/v1/search";
const CUSTOMER_FORECAST_URL = "https://customer-api.open-meteo.com/v1/forecast";

const geocodingSchema = z.object({
  results: z.array(z.object({
    latitude: z.number(),
    longitude: z.number(),
    name: z.string(),
    admin1: z.string().optional(),
    country: z.string().optional(),
    timezone: z.string().optional(),
  })).optional(),
});

const forecastSchema = z.object({
  daily: z.object({
    time: z.array(z.string()),
    weather_code: z.array(z.number().nullable()),
    temperature_2m_max: z.array(z.number().nullable()),
    temperature_2m_min: z.array(z.number().nullable()),
    precipitation_probability_max: z.array(z.number().nullable()),
    wind_gusts_10m_max: z.array(z.number().nullable()),
  }),
});

export type CommunityEventWeather = {
  forecast_date: string;
  condition: string;
  weather_code: number;
  temperature_min_c: number;
  temperature_max_c: number;
  precipitation_probability: number | null;
  wind_gusts_kph: number | null;
  location_label: string;
  provider_name: "Open-Meteo";
  provider_url: "https://open-meteo.com/";
  is_approximate: true;
};

type WeatherProviderConfig = {
  geocodingUrl: string;
  forecastUrl: string;
  apiKey: string | null;
};

function validHttpsUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function readEventWeatherConfig(env: NodeJS.ProcessEnv = process.env): WeatherProviderConfig | null {
  const customGeocoding = validHttpsUrl(env.OPEN_METEO_GEOCODING_URL?.trim());
  const customForecast = validHttpsUrl(env.OPEN_METEO_FORECAST_URL?.trim());
  const apiKey = env.OPEN_METEO_API_KEY?.trim() || null;

  // Production must use contracted Open-Meteo access or explicitly configured
  // self-hosted endpoints. The public endpoints remain convenient for local QA.
  if (customGeocoding || customForecast) {
    if (!customGeocoding || !customForecast) return null;
    return { geocodingUrl: customGeocoding, forecastUrl: customForecast, apiKey };
  }
  if (apiKey) {
    return { geocodingUrl: CUSTOMER_GEOCODING_URL, forecastUrl: CUSTOMER_FORECAST_URL, apiKey };
  }
  if (env.NODE_ENV !== "production") {
    return { geocodingUrl: PUBLIC_GEOCODING_URL, forecastUrl: PUBLIC_FORECAST_URL, apiKey: null };
  }
  return null;
}

function localDateString(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: "year" | "month" | "day") => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function weatherCondition(code: number) {
  if (code === 0) return "Clear";
  if (code <= 3) return "Partly cloudy";
  if (code === 45 || code === 48) return "Foggy";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code >= 61 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Rain showers";
  if (code >= 85 && code <= 86) return "Snow showers";
  if (code >= 95) return "Thunderstorms";
  return "Forecast available";
}

function appendApiKey(url: URL, apiKey: string | null) {
  if (apiKey) url.searchParams.set("apikey", apiKey);
}

export async function getCommunityEventWeather(input: {
  generalLocation: string;
  startsAt: string;
  endsAt: string;
  now?: Date;
}): Promise<CommunityEventWeather | null> {
  const config = readEventWeatherConfig();
  if (!config) return null;

  const now = input.now ?? new Date();
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) return null;
  if (endsAt <= now || startsAt.getTime() - now.getTime() > FORECAST_WINDOW_MS) return null;

  try {
    const geocodingUrl = new URL(config.geocodingUrl);
    geocodingUrl.searchParams.set("name", input.generalLocation.trim().slice(0, 120));
    geocodingUrl.searchParams.set("count", "1");
    geocodingUrl.searchParams.set("language", "en");
    geocodingUrl.searchParams.set("format", "json");
    appendApiKey(geocodingUrl, config.apiKey);

    const geocodingResponse = await fetch(geocodingUrl, {
      headers: { Accept: "application/json" },
      next: { revalidate: 30 * 24 * 60 * 60 },
      signal: AbortSignal.timeout(4_000),
    });
    if (!geocodingResponse.ok) return null;
    const geocoding = geocodingSchema.safeParse(await geocodingResponse.json());
    const location = geocoding.success ? geocoding.data.results?.[0] : null;
    if (!location) return null;

    const timezone = location.timezone ?? "UTC";
    const forecastUrl = new URL(config.forecastUrl);
    forecastUrl.searchParams.set("latitude", String(location.latitude));
    forecastUrl.searchParams.set("longitude", String(location.longitude));
    forecastUrl.searchParams.set("daily", [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_probability_max",
      "wind_gusts_10m_max",
    ].join(","));
    forecastUrl.searchParams.set("timezone", "auto");
    forecastUrl.searchParams.set("forecast_days", "16");
    appendApiKey(forecastUrl, config.apiKey);

    const forecastResponse = await fetch(forecastUrl, {
      headers: { Accept: "application/json" },
      next: { revalidate: 30 * 60 },
      signal: AbortSignal.timeout(4_000),
    });
    if (!forecastResponse.ok) return null;
    const forecast = forecastSchema.safeParse(await forecastResponse.json());
    if (!forecast.success) return null;

    const targetInstant = startsAt > now ? startsAt : now;
    const targetDate = localDateString(targetInstant, timezone);
    const index = forecast.data.daily.time.indexOf(targetDate);
    if (index < 0) return null;

    const code = forecast.data.daily.weather_code[index];
    const minimum = forecast.data.daily.temperature_2m_min[index];
    const maximum = forecast.data.daily.temperature_2m_max[index];
    if (code == null || minimum == null || maximum == null) return null;

    const labelParts = [location.name, location.admin1, location.country].filter(Boolean);
    return {
      forecast_date: targetDate,
      condition: weatherCondition(code),
      weather_code: code,
      temperature_min_c: Math.round(minimum * 10) / 10,
      temperature_max_c: Math.round(maximum * 10) / 10,
      precipitation_probability: forecast.data.daily.precipitation_probability_max[index] ?? null,
      wind_gusts_kph: forecast.data.daily.wind_gusts_10m_max[index] ?? null,
      location_label: labelParts.join(", "),
      provider_name: "Open-Meteo",
      provider_url: "https://open-meteo.com/",
      is_approximate: true,
    };
  } catch {
    // Weather is supplemental. Provider, geocoding, and timeout failures must
    // never prevent a member from opening the event itself.
    return null;
  }
}
