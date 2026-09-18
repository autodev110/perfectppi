import "server-only";

import { headers } from "next/headers";
import { createTranslator, DEFAULT_LOCALE, SUPPORTED_LOCALES, resolveLocale, type Locale, type Translator } from "./index.ts";

/** The locale negotiated for this request (Accept-Language, default English). */
export async function getRequestLocale(): Promise<Locale> {
  // Keep public pages prerenderable until another language is actually shipped.
  if ((SUPPORTED_LOCALES as readonly string[]).length === 1) return DEFAULT_LOCALE;
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
