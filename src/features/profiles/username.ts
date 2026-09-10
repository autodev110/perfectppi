import { z } from "zod";

export const USERNAME_MIN_LENGTH = 4;
export const USERNAME_MAX_LENGTH = 16;

export const usernameSchema = z.string()
  .trim()
  .min(USERNAME_MIN_LENGTH, "Username must be at least 4 characters")
  .max(USERNAME_MAX_LENGTH, "Username must be no more than 16 characters")
  .regex(
    /^[A-Za-z0-9_]+$/,
    "Use only letters, numbers, and underscores",
  );

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

