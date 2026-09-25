import { haversineKm } from "./geo";
import { filterAndGroup } from "./search";
import type { Meeting, SearchFilters } from "./types";
import { DEFAULT_FILTERS } from "./types";
import {
  MAX_CHAT_MEETINGS,
  type ChatMeetingRef,
} from "./chat-request";

export const MAX_TOOL_MEETINGS = 8;

export type ToolMeeting = {
  feedId: string;
  slug: string;
  name: string;
  groupName: string | null;
  day: number | null;
  time: string | null;
  endTime: string | null;
  types: string[];
  attendance: Meeting["attendance"];
  fellowship: Meeting["fellowship"];
  locationName: string | null;
  address: string | null;
  city: string | null;
  neighborhood: string | null;
  notes: string | null;
  locationNotes: string | null;
  conferenceUrl: string | null;
  conferencePhone: string | null;
  distanceKm: number;
  href: string;
};

export function meetingKey(feedId: string, slug: string) {
  return `${feedId}:${slug}`;
}

export function allowedMeetingKeys(allowed: ChatMeetingRef[]) {
  return new Set(allowed.map((item) => meetingKey(item.feedId, item.slug)));
}

export function meetingRefsForChat(
  meetings: Meeting[],
  origin: { lat: number; lng: number } | null,
  radiusKm: number,
  limit = MAX_CHAT_MEETINGS,
): ChatMeetingRef[] {
  const refs: ChatMeetingRef[] = [];
  for (const meeting of meetings) {
    let distanceKm: number | null = null;
    if (origin && meeting.lat != null && meeting.lng != null) {
      distanceKm = haversineKm(
        origin.lat,
        origin.lng,
        meeting.lat,
        meeting.lng,
      );
      if (distanceKm > radiusKm) continue;
    }
    refs.push({
      feedId: meeting.feedId,
      slug: meeting.slug,
      distanceKm: distanceKm == null ? 0 : Math.round(distanceKm),
    });
  }
  refs.sort((left, right) => left.distanceKm - right.distanceKm);
  return refs.slice(0, limit);
}

export function stripMeetingCoordinates(
  meeting: Meeting,
  distanceKm: number,
): ToolMeeting {
  return {
    feedId: meeting.feedId,
    slug: meeting.slug,
    name: meeting.name,
    groupName: meeting.groupName,
    day: meeting.day,
    time: meeting.time,
    endTime: meeting.endTime,
    types: meeting.types,
    attendance: meeting.attendance,
    fellowship: meeting.fellowship,
    locationName: meeting.locationName,
    address: meeting.address,
    city: meeting.city,
    neighborhood: meeting.neighborhood,
    notes: meeting.notes,
    locationNotes: meeting.locationNotes,
    conferenceUrl: meeting.conferenceUrl,
    conferencePhone: meeting.conferencePhone,
    distanceKm,
    href: `/meetings/${meeting.feedId}/${meeting.slug}`,
  };
}

export function filterAllowedMeetings(
  meetings: Meeting[],
  allowed: ChatMeetingRef[],
) {
  const keys = allowedMeetingKeys(allowed);
  return meetings.filter((meeting) =>
    keys.has(meetingKey(meeting.feedId, meeting.slug)),
  );
}

export function searchAllowedMeetings(
  meetings: Meeting[],
  allowed: ChatMeetingRef[],
  filters: Partial<SearchFilters>,
) {
  const scoped = filterAllowedMeetings(meetings, allowed);
  const distances = new Map(
    allowed.map((item) => [meetingKey(item.feedId, item.slug), item.distanceKm]),
  );
  const nextFilters: SearchFilters = {
    ...DEFAULT_FILTERS,
    ...filters,
    radiusKm: DEFAULT_FILTERS.radiusKm,
  };
  const { groups } = filterAndGroup(scoped, nextFilters, null);
  return [
    ...groups.happening,
    ...groups.soon,
    ...groups.later,
    ...groups.week,
    ...groups.other,
  ]
    .slice(0, MAX_TOOL_MEETINGS)
    .map((meeting) =>
      stripMeetingCoordinates(
        meeting,
        distances.get(meetingKey(meeting.feedId, meeting.slug)) ?? 0,
      ),
    );
}
