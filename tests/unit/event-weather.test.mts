import { resolveSourceCopy } from "../helpers/localized-source.mts";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

const root = process.cwd();
const source = (path: string) => readFile(`${root}/${path}`, "utf8").then(resolveSourceCopy);

describe("community event weather (plan 26.3)", () => {
  test("uses only the public general area and fails open when weather is unavailable", async () => {
    const weather = await source("src/features/social/event-weather.ts");
    const events = await source("src/features/social/events.ts");

    assert.match(events, /getCommunityEventWeather\(\{[\s\S]*generalLocation: summary\.general_location/);
    assert.doesNotMatch(events, /getCommunityEventWeather\(\{[\s\S]{0,300}exact_location/);
    assert.match(weather, /catch \{[\s\S]*return null;[\s\S]*\}/);
    assert.match(weather, /AbortSignal\.timeout\(4_000\)/);
    assert.match(weather, /endsAt <= now/);
    assert.match(weather, /FORECAST_WINDOW_MS/);
  });

  test("requires contracted or self-hosted HTTPS endpoints in production", async () => {
    const weather = await source("src/features/social/event-weather.ts");
    const example = await source(".env.example");

    assert.match(weather, /url\.protocol === "https:"/);
    assert.match(weather, /if \(apiKey\)[\s\S]*CUSTOMER_GEOCODING_URL/);
    assert.match(weather, /env\.NODE_ENV !== "production"[\s\S]*PUBLIC_GEOCODING_URL/);
    assert.match(example, /OPEN_METEO_API_KEY=/);
    assert.match(example, /OPEN_METEO_GEOCODING_URL=/);
    assert.match(example, /OPEN_METEO_FORECAST_URL=/);
  });

  test("shows an attributed approximate forecast on web and iOS", async () => {
    const web = await source("src/app/(public)/community/events/[id]/page.tsx");
    const models = await source("mobile-app/PerfectPPI/Core/Models/Domain.swift");
    const ios = await source("mobile-app/PerfectPPI/Features/Community/CommunityFeedView.swift");

    assert.match(web, /Approximate forecast for/);
    assert.match(web, /Weather data by/);
    assert.match(models, /struct CommunityEventWeather/);
    assert.match(models, /let weather: CommunityEventWeather\?/);
    assert.match(ios, /Section\("Weather"\)/);
    assert.match(ios, /Weather data by/);
  });
});
