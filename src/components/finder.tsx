"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MeetingCard } from "@/components/meeting-card";
import { MeetingMap } from "@/components/meeting-map";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { encodeGeohash4 } from "@/lib/geo";
import {
  DEFAULT_FILTERS,
  type City,
  type Meeting,
  type SearchFilters,
  type SlicePayload,
} from "@/lib/types";
import { readSlice, writeSlice, savePlace } from "@/lib/idb";
import {
  filterAndGroup,
  type RankedMeeting,
} from "@/lib/search";
import { FILTER_TYPE_CODES, labelForType } from "@/lib/spec";
import { FELLOWSHIP_LABEL, type FellowshipFilter } from "@/lib/fellowship";
import { ComicStrip } from "@/components/comic-strip";
import { cn } from "@/lib/utils";
import { ChevronDown, SlidersHorizontal } from "lucide-react";

const DAYS: Array<{ value: SearchFilters["day"]; label: string }> = [
  { value: "today", label: "Today" },
  { value: "any", label: "Any day" },
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

export function Finder({
  initialMeetings,
  mode = "nearby",
}: {
  initialMeetings?: Meeting[];
  mode?: "nearby" | "online";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [filters, setFilters] = useState<SearchFilters>({
    ...DEFAULT_FILTERS,
    attendance: mode === "online" ? "online" : "either",
    week: mode === "online",
  });
  const [cityQuery, setCityQuery] = useState("");
  const [cities, setCities] = useState<City[]>([]);
  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [geohash, setGeohash] = useState(params.get("gh"));
  const [slice, setSlice] = useState<SlicePayload | null>(() =>
    initialMeetings
      ? {
          geohash: "provided",
          neighbors: [],
          fetchedAt: new Date(0).toISOString(),
          meetings: initialMeetings,
          sourceFeeds: [],
        }
      : null,
  );
  const [status, setStatus] = useState("Find a city, or use this device’s location.");
  const [showMap, setShowMap] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [offlineNote, setOfflineNote] = useState<string | null>(null);

  const loadSlice = useCallback(async (hash: string, nextOrigin?: { lat: number; lng: number } | null) => {
    setGeohash(hash);
    setStatus("Loading meetings…");
    const cached = await readSlice(hash);
    if (cached?.slice) {
      setSlice(cached.slice);
      if (cached.stale) setOfflineNote(`Cached list from ${new Date(cached.slice.fetchedAt).toLocaleString()}`);
      else setOfflineNote(`Times as of ${new Date(cached.slice.fetchedAt).toLocaleTimeString()}`);
    }
    try {
      const response = await fetch(`/api/slices/${hash}`);
      if (!response.ok) throw new Error("Could not load this area");
      const data = (await response.json()) as SlicePayload;
      setSlice(data);
      await writeSlice(data);
      setOfflineNote(`Times as of ${new Date(data.fetchedAt).toLocaleTimeString()}`);
      setStatus(
        data.meetings.length
          ? `${data.meetings.length} listings in this area`
          : "No public feed covers this area yet",
      );
    } catch {
      if (!cached?.slice) {
        setStatus("No public feed covers this area yet — try Online.");
      } else {
        setOfflineNote(
          `Showing saved list from ${new Date(cached.slice.fetchedAt).toLocaleString()} (offline)`,
        );
      }
    }
    if (nextOrigin) setOrigin(nextOrigin);
    const next = new URLSearchParams(params.toString());
    next.set("gh", hash);
    next.delete("lat");
    next.delete("lng");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [params, pathname, router]);

  useEffect(() => {
    const gh = params.get("gh");
    const city = params.get("city");
    const handle = window.setTimeout(() => {
      if (gh && gh !== geohash) {
        void loadSlice(gh);
      } else if (city) {
        void (async () => {
          const response = await fetch(`/api/cities?q=${encodeURIComponent(city)}`);
          const data = (await response.json()) as { cities: City[] };
          const match = data.cities.find((c) => c.slug === city) ?? data.cities[0];
          if (match) {
            setSelectedCity(match);
            setOrigin({ lat: match.lat, lng: match.lng });
            await loadSlice(match.geohash4, { lat: match.lat, lng: match.lng });
          }
        })();
      }
    }, 0);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const q = cityQuery.trim();
    const handle = window.setTimeout(async () => {
      const url =
        q.length >= 2 ? `/api/cities?q=${encodeURIComponent(q)}` : "/api/cities";
      const response = await fetch(url);
      if (!response.ok) return;
      const data = (await response.json()) as { cities: City[] };
      setCities(data.cities);
    }, q.length >= 2 ? 200 : 0);
    return () => window.clearTimeout(handle);
  }, [cityQuery]);

  useEffect(() => {
    if (mode !== "online" || initialMeetings) return;
    void (async () => {
      const response = await fetch("/api/online?limit=120");
      if (!response.ok) return;
      const data = (await response.json()) as { meetings: Meeting[] };
      setSlice({
        geohash: "online",
        neighbors: [],
        fetchedAt: new Date().toISOString(),
        meetings: data.meetings,
        sourceFeeds: [],
      });
      setStatus(`${data.meetings.length} online / hybrid listings`);
    })();
  }, [initialMeetings, mode]);

  const meetings = useMemo(() => slice?.meetings ?? [], [slice]);
  const { groups, count } = useMemo(
    () => filterAndGroup(meetings, filters, origin),
    [meetings, filters, origin],
  );
  const flat: RankedMeeting[] = [
    ...groups.happening,
    ...groups.soon,
    ...groups.later,
    ...groups.week,
    ...groups.other,
  ];

  function useLocation() {
    if (!navigator.geolocation) {
      setStatus("This device cannot share location. Search a city instead.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setOrigin(next);
        void loadSlice(encodeGeohash4(next.lat, next.lng), next);
      },
      () => setStatus("Location was denied. Search a city instead."),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    );
  }

  async function pickCity(city: City) {
    setSelectedCity(city);
    setCityQuery("");
    setCities([]);
    setOrigin({ lat: city.lat, lng: city.lng });
    const next = new URLSearchParams(params.toString());
    next.set("city", city.slug);
    next.set("gh", city.geohash4);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    await loadSlice(city.geohash4, { lat: city.lat, lng: city.lng });
  }

  const emptyBecauseCoverage =
    Boolean(geohash) && meetings.length === 0 && mode === "nearby";
  const emptyBecauseFilters = meetings.length > 0 && count === 0;
  const defaultFilters: SearchFilters = {
    ...DEFAULT_FILTERS,
    attendance: mode === "online" ? "online" : "either",
    week: mode === "online",
  };
  const activeFilterCount = [
    filters.fellowship !== defaultFilters.fellowship,
    filters.attendance !== defaultFilters.attendance,
    filters.day !== defaultFilters.day || filters.week !== defaultFilters.week,
    filters.timeWindow !== defaultFilters.timeWindow,
    filters.openClosed !== defaultFilters.openClosed,
    filters.types.length > 0,
    filters.radiusKm !== defaultFilters.radiusKm,
  ].filter(Boolean).length;

  return (
    <div className="space-y-5">
      {mode === "nearby" ? (
        <section className="space-y-3">
          <h1 className="comic-wordmark font-display text-5xl lowercase tracking-tight sm:text-6xl">
            darkness dies at the door
          </h1>
          <ComicStrip />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={cityQuery}
              onChange={(e) => setCityQuery(e.target.value)}
              placeholder="City or town"
              aria-label="Search city"
            />
            <Button type="button" variant="outline" onClick={useLocation}>
              Use my location
            </Button>
          </div>
          {cities.length > 0 ? (
            <ul className="divide-y divide-black overflow-hidden border-4 border-black bg-card shadow-[6px_6px_0_0_#3d8bff]">
              {cities.slice(0, cityQuery.trim().length >= 2 ? 20 : 8).map((city) => (
                <li key={city.slug}>
                  <button
                    className="flex min-h-12 w-full items-center justify-between px-4 text-left"
                    onClick={() => void pickCity(city)}
                  >
                    <span>
                      {city.label}
                      {city.country ? `, ${city.country}` : ""}
                    </span>
                    <span className="text-sm text-muted">{city.meetingCount}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <span>{selectedCity ? selectedCity.label : geohash ? `Area ${geohash}` : "No area yet"}</span>
            {origin ? (
              <>
                <button className="underline" onClick={() => void savePlace({ kind: "home", label: selectedCity?.label ?? "Home", geohash4: geohash ?? encodeGeohash4(origin.lat, origin.lng), lat: origin.lat, lng: origin.lng, citySlug: selectedCity?.slug })}>
                  Save as Home
                </button>
                <button className="underline" onClick={() => void savePlace({ kind: "work", label: selectedCity?.label ?? "Work", geohash4: geohash ?? encodeGeohash4(origin.lat, origin.lng), lat: origin.lat, lng: origin.lng, citySlug: selectedCity?.slug })}>
                  Work
                </button>
                <button className="underline" onClick={() => void savePlace({ kind: "travel", label: selectedCity?.label ?? "Travel", geohash4: geohash ?? encodeGeohash4(origin.lat, origin.lng), lat: origin.lat, lng: origin.lng, citySlug: selectedCity?.slug })}>
                  Travel
                </button>
              </>
            ) : null}
          </div>
          <p>{status}</p>
          {offlineNote ? <p className="text-sm text-muted">{offlineNote}</p> : null}
        </section>
      ) : (
        <section>
          <h1 className="comic-wordmark font-display text-5xl uppercase tracking-tight">Online meetings</h1>
          <p className="mt-2 text-muted">
            Times are shown in your timezone. Join links stay on this device.
          </p>
          <div className="mt-4">
            <ComicStrip compact />
          </div>
        </section>
      )}

      <Input
        value={filters.query}
        onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
        placeholder="Filter by name, location, or notes"
        aria-label="Filter meetings"
      />

      <div className="flex items-center gap-2 md:hidden">
        <Button
          type="button"
          variant="outline"
          className="flex-1 justify-between"
          aria-expanded={showFilters}
          aria-controls="meeting-filters"
          onClick={() => setShowFilters((value) => !value)}
        >
          <span className="flex items-center gap-2">
            <SlidersHorizontal aria-hidden="true" size={18} />
            Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
          </span>
          <ChevronDown
            aria-hidden="true"
            size={18}
            className={cn("transition-transform", showFilters && "rotate-180")}
          />
        </Button>
      </div>

      <section
        id="meeting-filters"
        aria-label="Meeting filters"
        className={cn(
          "space-y-5 border-2 border-black bg-card p-4 shadow-[4px_4px_0_0_#000] md:block",
          showFilters ? "block" : "hidden",
        )}
      >
        <FilterGroup label="Fellowship">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {(["all", "aa", "na", "ca"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={filters.fellowship === value}
                className={cn(
                  "min-h-12 shrink-0 border-2 border-black px-3 text-sm font-semibold uppercase tracking-wide shadow-[3px_3px_0_0_#000]",
                  filters.fellowship === value
                    ? value === "na"
                      ? "bg-hot text-black"
                      : value === "ca"
                        ? "bg-cool text-black"
                        : value === "aa"
                          ? "bg-accent text-accent-fg"
                          : "bg-warn text-black"
                    : "bg-card text-foreground",
                )}
                onClick={() => setFilters((f) => ({ ...f, fellowship: value as FellowshipFilter }))}
              >
                {value === "all" ? "All" : FELLOWSHIP_LABEL[value]}
              </button>
            ))}
          </div>
        </FilterGroup>

        <FilterGroup label="Attendance">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {(["in-person", "online", "either"] as const).map((value) => (
              <Button
                key={value}
                className="shrink-0"
                variant={filters.attendance === value ? "default" : "outline"}
                onClick={() => setFilters((f) => ({ ...f, attendance: value }))}
              >
                {value === "in-person" ? "In person" : value === "online" ? "Online" : "Either"}
              </Button>
            ))}
          </div>
        </FilterGroup>

        <FilterGroup label="Day">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {DAYS.map((day) => (
              <button
                key={String(day.value)}
                className={cn(
                  "min-h-12 shrink-0 border-2 border-black px-3 text-sm font-semibold uppercase shadow-[3px_3px_0_0_#000]",
                  filters.day === day.value
                    ? "bg-warn text-black"
                    : "bg-card text-foreground",
                )}
                onClick={() =>
                  setFilters((f) => ({
                    ...f,
                    day: day.value,
                    week: day.value === "any",
                  }))
                }
              >
                {day.label}
              </button>
            ))}
            <button
              className={cn(
                "min-h-12 shrink-0 border-2 border-black px-3 text-sm font-semibold uppercase shadow-[3px_3px_0_0_#000]",
                filters.week ? "bg-hot text-black" : "bg-card text-foreground",
              )}
              onClick={() => setFilters((f) => ({ ...f, week: !f.week, day: f.week ? "today" : "any" }))}
            >
              Rest of week
            </button>
          </div>
        </FilterGroup>

        <FilterGroup label="Time">
          <div className="flex flex-wrap gap-2">
            {(["any", "morning", "afternoon", "evening"] as const).map((slot) => (
              <Chip
                key={slot}
                active={filters.timeWindow === slot}
                onClick={() => setFilters((f) => ({ ...f, timeWindow: slot }))}
              >
                {slot}
              </Chip>
            ))}
          </div>
        </FilterGroup>

        <FilterGroup label="Access">
          <div className="flex flex-wrap gap-2">
            {(["O", "C"] as const).map((value) => (
              <Chip
                key={value}
                active={filters.openClosed === value}
                onClick={() =>
                  setFilters((f) => ({
                    ...f,
                    openClosed: f.openClosed === value ? "any" : value,
                  }))
                }
              >
                {value === "O" ? "Open" : "Closed"}
              </Chip>
            ))}
          </div>
        </FilterGroup>

        <FilterGroup label="Meeting type">
          <div className="flex flex-wrap gap-2">
            {FILTER_TYPE_CODES.map((code) => (
              <Chip
                key={code}
                active={filters.types.includes(code)}
                onClick={() =>
                  setFilters((f) => ({
                    ...f,
                    types: f.types.includes(code)
                      ? f.types.filter((t) => t !== code)
                      : [...f.types, code],
                  }))
                }
              >
                {labelForType(code)}
              </Chip>
            ))}
          </div>
        </FilterGroup>

        {mode === "nearby" ? (
          <FilterGroup label="Distance">
            <label className="flex max-w-sm items-center gap-3 text-sm">
              <span className="shrink-0">Within {filters.radiusKm} km</span>
              <input
                className="w-full"
                type="range"
                min={2}
                max={50}
                value={filters.radiusKm}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, radiusKm: Number(e.target.value) }))
                }
              />
            </label>
          </FilterGroup>
        ) : null}

        <div className="flex justify-end border-t-2 border-black pt-4">
          <Button type="button" variant="outline" onClick={() => setFilters(defaultFilters)}>
            Reset filters
          </Button>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted">{count} match{count === 1 ? "" : "es"} with these filters</p>
        {mode === "nearby" ? (
          <Button variant="outline" onClick={() => setShowMap((v) => !v)}>
            {showMap ? "Hide map" : "Show map"}
          </Button>
        ) : null}
      </div>

      {showMap ? <MeetingMap meetings={flat} origin={origin} /> : null}

      {emptyBecauseCoverage ? (
        <EmptyCoverage city={selectedCity?.label} />
      ) : emptyBecauseFilters ? (
        <p className="rounded-2xl border border-border p-4">
          These filters hid every listing. Loosen day, type, fellowship, or distance — there
          are still {meetings.length} meetings in this slice.
        </p>
      ) : (
        <div className="space-y-8">
          <Group title="Happening now" items={groups.happening} />
          <Group title="Starting within 2 hours" items={groups.soon} />
          <Group title="Later today" items={groups.later} />
          {filters.week || filters.day === "any" ? (
            <Group title="Rest of the week" items={groups.week} showDay />
          ) : null}
        </div>
      )}
    </div>
  );
}

const chipClass =
  "min-h-12 border-2 border-black bg-card px-3 text-sm font-semibold uppercase capitalize text-foreground shadow-[3px_3px_0_0_#000]";
const chipActiveClass =
  "min-h-12 border-2 border-black bg-warn px-3 text-sm font-semibold uppercase capitalize text-black shadow-[3px_3px_0_0_#000]";

function Chip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button aria-pressed={active} className={active ? chipActiveClass : chipClass} onClick={onClick}>
      {children}
    </button>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h2 className="text-xs font-bold uppercase tracking-widest text-muted">{label}</h2>
      {children}
    </div>
  );
}

function Group({
  title,
  items,
  showDay,
}: {
  title: string;
  items: RankedMeeting[];
  showDay?: boolean;
}) {
  if (!items.length) return null;
  return (
    <section className="space-y-3">
      <h2 className="font-display text-2xl uppercase tracking-tight text-warn">{title}</h2>
      <ul className="space-y-3">
        {items.map((meeting) => (
          <li key={`${meeting.feedId}:${meeting.slug}`}>
            <MeetingCard meeting={meeting} showDay={showDay} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function EmptyCoverage({ city }: { city?: string }) {
  return (
    <div className="comic-frame space-y-3 bg-card p-5">
        <p className="text-lg font-medium">
        {city
          ? `No public feed covers ${city} yet.`
          : "No public feed covers this area yet."}
      </p>
      <p className="text-muted">
        Local offices publish public Meeting Guide, TSML, or BMLT JSON.
        If your intergroup has a public feed, it can be added on the Feeds page.
        Meanwhile, online meetings still work worldwide.
      </p>
      <p className="text-sm text-muted">
        UK A.A. national listings live on{" "}
        <a className="underline" href="https://www.alcoholics-anonymous.org.uk/AA-Meetings/Find-a-Meeting">
          alcoholics-anonymous.org.uk
        </a>
        . UK NA is at{" "}
        <a className="underline" href="https://www.ukna.org">
          ukna.org
        </a>
        . UK CA is at{" "}
        <a className="underline" href="https://meetings.cocaineanonymous.org.uk/meetings/">
          meetings.cocaineanonymous.org.uk
        </a>
        .
      </p>
      <div className="flex gap-2">
        <a href="/online">
          <Button>See online meetings</Button>
        </a>
        <a href="/coverage">
          <Button variant="outline">Coverage map</Button>
        </a>
      </div>
    </div>
  );
}

