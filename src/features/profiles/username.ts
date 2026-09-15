import { z } from "zod";
// Relative so the node test runner can load this module without path aliases.
import { t } from "../../lib/i18n/index.ts";

export const USERNAME_MIN_LENGTH = 4;
export const USERNAME_MAX_LENGTH = 16;

// Rule messages come from the catalog; the rules themselves are fixed and
// identical in the client, the server, and the database (plan 8.1, 32.2).
export const usernameSchema = z.string()
  .trim()
  .min(USERNAME_MIN_LENGTH, t("username.too_short", { min: USERNAME_MIN_LENGTH }))
  .max(USERNAME_MAX_LENGTH, t("username.too_long", { max: USERNAME_MAX_LENGTH }))
  .regex(
    /^[A-Za-z0-9_]+$/,
    t("username.characters"),
  );

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}
