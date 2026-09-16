import type { Meeting, MeetingGroupKey, SearchFilters } from "./types";
import { haversineKm } from "./geo";
import { labelForType } from "./spec";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const COMBINING_MARKS = /[\u0300-\u036f]/g;
const WHITESPACE = /\s+/g;

function normalizeSearchText(value: string) {
  return value
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .toLocaleLowerCase()
    .replace(WHITESPACE, " ")
    .trim();
}

export function weekdayLabel(day: number) {
  return WEEKDAYS[day] ?? "";
}

function parseMinutes(time: string | null) {
  if (!time || !/^\d{1,2}:\d{2}/.test(time)) return null;
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function zonedParts(date: Date, timeZone?: string | null) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: timeZone || undefined,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((p) => [p.type, p.value]),
  );
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    weekday: weekdayMap[parts.weekday] ?? date.getDay(),
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

export function meetingEndMinutes(meeting: Meeting) {
  const start = parseMinutes(meeting.time);
  if (start == null) return null;
  const end = parseMinutes(meeting.endTime);
  if (end != null) return end;
  return (start + 60) % (24 * 60);
}

export type RankedMeeting = Meeting & {
  distanceKm: number | null;
  minutesUntilStart: number | null;
  daysUntil: number | null;
  inProgress: boolean;
  group: MeetingGroupKey;
  nextDay: number | null;
};

export function formatTime(time: string | null) {
  if (!time) return "Time TBA";
  const mins = parseMinutes(time);
  if (mins == null) return time;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
}

export function filterAndGroup(
  meetings: Meeting[],
  filters: SearchFilters,
  origin: { lat: number; lng: number } | null,
  now = new Date(),
): { groups: Record<MeetingGroupKey, RankedMeeting[]>; count: number } {
  const local = zonedParts(now);
  const today = filters.day === "today" ? local.weekday : filters.day;

  const ranked: RankedMeeting[] = [];

  for (const meeting of meetings) {
    if (
      filters.fellowship !== "all" &&
      (meeting.fellowship || "aa") !== filters.fellowship
    ) {
      continue;
    }

    if (filters.attendance !== "either") {
      if (filters.attendance === "online") {
        if (meeting.attendance === "in-person") continue;
      } else if (meeting.attendance === "online") {
        continue;
      }
    }

    if (filters.openClosed !== "any") {
      const types = meeting.types;
      if (filters.openClosed === "O" && !types.includes("O")) continue;
      if (filters.openClosed === "C" && !types.includes("C")) continue;
    }

    if (filters.types.length > 0) {
      if (!filters.types.every((t) => meeting.types.includes(t))) continue;
    }

    if (filters.query.trim()) {
      const terms = normalizeSearchText(filters.query).split(" ");
      const searchableValues = [
        meeting.name,
        meeting.groupName,
        meeting.locationName,
        meeting.city,
        meeting.state,
        meeting.country,
        meeting.address,
        meeting.formattedAddress,
        meeting.notes,
        meeting.locationNotes,
        meeting.attendance,
        meeting.fellowship,
        ...meeting.types,
        ...meeting.types.map(labelForType),
      ]
        .filter((value): value is string => Boolean(value));
      const hay = normalizeSearchText(searchableValues.join(" "));
      if (!terms.every((term) => hay.includes(term))) continue;
    }

    const start = parseMinutes(meeting.time);
    if (filters.timeWindow !== "any" && start != null) {
      if (filters.timeWindow === "morning" && (start < 5 * 60 || start >= 12 * 60))
        continue;
      if (
        filters.timeWindow === "afternoon" &&
        (start < 12 * 60 || start >= 17 * 60)
      )
        continue;
      if (filters.timeWindow === "evening" && start < 17 * 60) continue;
    }

    let distanceKm: number | null = null;
    if (origin && meeting.lat != null && meeting.lng != null) {
      distanceKm = haversineKm(origin.lat, origin.lng, meeting.lat, meeting.lng);
      if (
        meeting.attendance !== "online" &&
        distanceKm > filters.radiusKm
      ) {
        continue;
      }
    }

    const meetingDay = meeting.day;
    let minutesUntilStart: number | null = null;
    let daysUntil: number | null = null;
    let inProgress = false;
    let group: MeetingGroupKey = "other";
    const end = meetingEndMinutes(meeting);

    if (meetingDay != null && start != null) {
      const tzParts = zonedParts(now, meeting.timezone);
      const currentDay = meeting.timezone ? tzParts.weekday : local.weekday;
      const currentMins = meeting.timezone ? tzParts.minutes : local.minutes;

      let deltaDays = (meetingDay - currentDay + 7) % 7;
      let deltaMins = start - currentMins + deltaDays * 24 * 60;
      if (end != null) {
        let duration = end - start;
        if (duration <= 0) duration += 24 * 60;
        inProgress = deltaMins <= 0 && deltaMins > -duration;
      }
      if (!inProgress && deltaMins < 0) {
        deltaMins += 7 * 24 * 60;
        deltaDays += 7;
      }

      minutesUntilStart = deltaMins;
      daysUntil = deltaDays;

      const selectedDay = today;
      const isSelectedDay =
        selectedDay === "any" ||
        meetingDay === selectedDay ||
        (selectedDay === local.weekday && inProgress);

      if (!filters.week && selectedDay !== "any" && !isSelectedDay) {
        continue;
      }

      if (inProgress) group = "happening";
      else if (deltaMins >= 0 && deltaMins <= 120 && (selectedDay === "any" || isSelectedDay))
        group = "soon";
      else if (deltaDays === 0 && (selectedDay === "any" || isSelectedDay))
        group = "later";
      else if (filters.week) group = "week";
      else if (selectedDay !== "any" && isSelectedDay && filters.day !== "today")
        group = "later";
      else continue;
    } else if (filters.week) {
      group = "week";
    } else if (today !== "any" && !filters.week) {
      continue;
    }

    ranked.push({
      ...meeting,
      distanceKm,
      minutesUntilStart,
      daysUntil,
      inProgress,
      group,
      nextDay: meetingDay,
    });
  }

  const sortFn = (a: RankedMeeting, b: RankedMeeting) => {
    const aMin = a.inProgress ? -1 : (a.minutesUntilStart ?? 99999);
    const bMin = b.inProgress ? -1 : (b.minutesUntilStart ?? 99999);
    if (aMin !== bMin) return aMin - bMin;
    return (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999);
  };

  const groups: Record<MeetingGroupKey, RankedMeeting[]> = {
    happening: [],
    soon: [],
    later: [],
    week: [],
    other: [],
  };
  for (const meeting of ranked) {
    groups[meeting.group].push(meeting);
  }
  for (const key of Object.keys(groups) as MeetingGroupKey[]) {
    groups[key].sort(sortFn);
  }

  return { groups, count: ranked.length };
}

export function formatDistance(km: number | null) {
  if (km == null) return null;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

export function formatUntil(
  minutes: number | null,
  inProgress: boolean,
  daysUntil?: number | null,
) {
  if (inProgress) return "Happening now";
  if (minutes == null) return null;
  if (minutes < 1) return "Starting now";
  if (minutes < 60) return `in ${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hours < 24) return mins ? `in ${hours}h ${mins}m` : `in ${hours}h`;
  if (daysUntil === 1) return "tomorrow";
  if (daysUntil != null && daysUntil > 1) return `in ${daysUntil} days`;
  const days = Math.round(hours / 24);
  return days === 1 ? "tomorrow" : `in ${days} days`;
}

export function isStale(updatedAt: string | null) {
  if (!updatedAt) return false;
  const then = new Date(updatedAt).getTime();
  if (Number.isNaN(then)) return false;
  return Date.now() - then > 90 * 24 * 60 * 60 * 1000;
}
