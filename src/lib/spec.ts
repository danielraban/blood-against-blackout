import { getTypesForLanguage } from "@code4recovery/spec";

let cached: Record<string, string> | null = null;

export function meetingTypeLabels(): Record<string, string> {
  if (cached) return cached;
  try {
    cached = getTypesForLanguage("en");
  } catch {
    cached = {};
  }
  return cached;
}

export function labelForType(code: string) {
  return meetingTypeLabels()[code] ?? code;
}

export const FILTER_TYPE_CODES = [
  "ONL",
  "B",
  "SP",
  "D",
  "BE",
  "LGBTQ",
  "W",
  "M",
  "X",
  "XB",
  "S",
  "ASL",
] as const;
