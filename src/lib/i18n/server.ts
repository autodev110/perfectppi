import "server-only";

import { headers } from "next/headers";
import { createTranslator, resolveLocale, type Locale, type Translator } from "./index.ts";

/** The locale negotiated for this request (Accept-Language, default English). */
export async function getRequestLocale(): Promise<Locale> {
  try {
    const requestHeaders = await headers();
    return resolveLocale(requestHeaders.get("accept-language"));
  } catch {
    // Outside a request (build-time rendering, workers): the default catalog.
    return resolveLocale(null);
  }
}

export async function getRequestTranslator(): Promise<Translator> {
  return createTranslator(await getRequestLocale());
}
