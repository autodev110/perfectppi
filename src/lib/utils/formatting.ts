import { DEFAULT_LOCALE, t } from "../i18n/index.ts";

export function formatMileage(mileage: number, locale: string = DEFAULT_LOCALE): string {
  return new Intl.NumberFormat(locale).format(mileage);
}

export function formatCurrency(cents: number, locale: string = DEFAULT_LOCALE): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function formatDate(date: string | Date, locale: string = DEFAULT_LOCALE): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

export function formatDateTime(date: string | Date, locale: string = DEFAULT_LOCALE): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function formatRelativeTime(date: string | Date, locale: string = DEFAULT_LOCALE): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = Math.floor((now - then) / 1000);

  if (diff >= 0 && diff < 60 && locale === DEFAULT_LOCALE) return t("format.just_now");
  const relative = new Intl.RelativeTimeFormat(locale, { style: "narrow", numeric: "auto" });
  if (Math.abs(diff) < 60) return relative.format(-diff, "second");
  if (Math.abs(diff) < 3600) return relative.format(-Math.trunc(diff / 60), "minute");
  if (Math.abs(diff) < 86400) return relative.format(-Math.trunc(diff / 3600), "hour");
  if (Math.abs(diff) < 604800) return relative.format(-Math.trunc(diff / 86400), "day");
  return formatDate(date, locale);
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
