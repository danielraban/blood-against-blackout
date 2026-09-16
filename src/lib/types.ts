import type { Fellowship, FellowshipFilter } from "./fellowship";

export type Attendance = "in-person" | "online" | "hybrid";

export type Meeting = {
  feedId: string;
  slug: string;
  name: string;
  groupName: string | null;
  day: number | null;
  time: string | null;
  endTime: string | null;
  timezone: string | null;
  types: string[];
  attendance: Attendance;
  fellowship: Fellowship;
  locationName: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  formattedAddress: string | null;
  lat: number | null;
  lng: number | null;
  geohash4: string | null;
  conferenceUrl: string | null;
  conferencePhone: string | null;
  notes: string | null;
  locationNotes: string | null;
  updatedAt: string | null;
  sourceVerifiedAt: string | null;
  entityId: string | null;
  entityName: string | null;
  entityPhone: string | null;
  entityEmail: string | null;
  entityUrl: string | null;
  feedbackEmails: string[];
};

export type City = {
  slug: string;
  label: string;
  state: string | null;
  country: string | null;
  lat: number;
  lng: number;
  geohash4: string;
  meetingCount: number;
};

export type SlicePayload = {
  geohash: string;
  neighbors: string[];
  fetchedAt: string;
  meetings: Meeting[];
  sourceFeeds: { id: string; name: string }[];
};

export type AttendanceFilter = "in-person" | "online" | "either";

export type SearchFilters = {
  attendance: AttendanceFilter;
  fellowship: FellowshipFilter;
  day: number | "today" | "any";
  timeWindow: "any" | "morning" | "afternoon" | "evening";
  openClosed: "any" | "O" | "C";
  types: string[];
  query: string;
  radiusKm: number;
  week: boolean;
};

export type MeetingGroupKey =
  | "happening"
  | "soon"
  | "later"
  | "week"
  | "other";

export const DEFAULT_FILTERS: SearchFilters = {
  attendance: "either",
  fellowship: "all",
  day: "today",
  timeWindow: "any",
  openClosed: "any",
  types: [],
  query: "",
  radiusKm: 15,
  week: false,
};
