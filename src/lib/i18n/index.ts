// Localization readiness (plan 32.2). User-facing copy that the server
// produces or that shared controls render lives in message catalogs keyed by
// stable identifiers; components and pure modules ask for a key instead of
// embedding the English sentence. Backend categories (report reasons, policy
// codes, enforcement actions, notification kinds) stay machine codes and the
// catalog supplies the label, so a new language is a new catalog file and
// nothing else.
//
// This module is dependency-free and safe in server components, client
// components, workers, and the node test runner. Relative imports keep it
// loadable without path aliases.
import { en, type MessageKey } from "./messages/en.ts";

export type { MessageKey };

export const SUPPORTED_LOCALES = ["en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

type Catalog = Readonly<Record<MessageKey, string>>;
const catalogs: Record<Locale, Partial<Catalog>> = { en };

export type MessageParams = Record<string, string | number>;

export function isSupportedLocale(value: string | null | undefined): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value ?? "");
}

/**
 * Picks the best supported locale from an Accept-Language header. Region
 * variants fall back to their language ("en-GB" → "en"); anything unknown
 * falls back to the default so a page always renders.
 */
export function resolveLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const ranked = acceptLanguage
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const weight = q ? Number.parseFloat(q.slice(2)) : 1;
      return { tag: tag.trim().toLowerCase(), weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter((entry) => entry.tag && entry.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  for (const { tag } of ranked) {
    const language = tag.split("-")[0];
    if (isSupportedLocale(tag)) return tag;
    if (isSupportedLocale(language)) return language;
  }
  return DEFAULT_LOCALE;
}

/** Replaces `{name}` placeholders; unknown placeholders are left visible so a missing param is noticed. */
export function formatMessage(template: string, params?: MessageParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined || value === null ? match : String(value);
  });
}

/** The message for `key` in `locale`, falling back to English and then to the key itself. */
export function translate(locale: Locale, key: MessageKey, params?: MessageParams): string {
  const template = catalogs[locale]?.[key] ?? en[key] ?? key;
  return formatMessage(template, params);
}

/** Default-locale shorthand for code that has no request context (workers, pure helpers). */
export function t(key: MessageKey, params?: MessageParams, locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, key, params);
}

export type Translator = (key: MessageKey, params?: MessageParams) => string;

export function createTranslator(locale: Locale): Translator {
  return (key, params) => translate(locale, key, params);
}

/** Every key the default catalog defines; the guard test checks usages against it. */
export function messageKeys(): MessageKey[] {
  return Object.keys(en) as MessageKey[];
}
