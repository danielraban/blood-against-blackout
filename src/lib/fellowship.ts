export type Fellowship = "aa" | "na" | "ca";
export type FellowshipFilter = "all" | Fellowship;
export type FeedFormat = "tsml" | "bmlt" | "oiaa";

export const FELLOWSHIP_LABEL: Record<Fellowship, string> = {
  aa: "AA",
  na: "NA",
  ca: "CA",
};

export const FELLOWSHIP_NAME: Record<Fellowship, string> = {
  aa: "Alcoholics Anonymous",
  na: "Narcotics Anonymous",
  ca: "Cocaine Anonymous",
};

export function asFellowship(value: unknown): Fellowship {
  if (value === "na" || value === "ca" || value === "aa") return value;
  return "aa";
}

export function asFeedFormat(value: unknown): FeedFormat {
  if (value === "bmlt" || value === "oiaa") return value;
  return "tsml";
}
