"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Map, SlidersHorizontal, X } from "lucide-react";

const DAYS: Array<{ value: SearchFilters["day"]; label: string }> = [
  { value: "today", label: "today" },
  { value: "any", label: "any day" },
  { value: 0, label: "sun" },
  { value: 1, label: "mon" },
  { value: 2, label: "tue" },
  { value: 3, label: "wed" },
  { value: 4, label: "thu" },
  { value: 5, label: "fri" },
  { value: 6, label: "sat" },
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
  const [citySearchState, setCitySearchState] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [cityOpen, setCityOpen] = useState(false);
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
  const filterPanelRef = useRef<HTMLElement>(null);

  const loadSlice = useCallback(async (
    hash: string,
    nextOrigin?: { lat: number; lng: number } | null,
    citySlug?: string | null,
  ) => {
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
    if (citySlug === null) next.delete("city");
    else if (citySlug) next.set("city", citySlug);
    next.delete("lat");
    next.delete("lng");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [params, pathname, router]);

  useEffect(() => {
    const gh = params.get("gh");
    const city = params.get("city");
    const handle = window.setTimeout(() => {
      if (city) {
        void (async () => {
          const response = await fetch(`/api/cities?q=${encodeURIComponent(city)}`);
          const data = (await response.json()) as { cities: City[] };
          const match = data.cities.find((c) => c.slug === city) ?? data.cities[0];
          if (match) {
            setSelectedCity(match);
            setOrigin({ lat: match.lat, lng: match.lng });
            await loadSlice(
              match.geohash4,
              { lat: match.lat, lng: match.lng },
              match.slug,
            );
          }
        })();
      } else if (gh && gh !== geohash) {
        void loadSlice(gh);
      }
    }, 0);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const q = cityQuery.trim();
    if (q.length < 2) return;
    const controller = new AbortController();
    const handle = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/cities?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("City search failed");
        const data = (await response.json()) as { cities: City[] };
        setCities(data.cities.slice(0, 6));
      } catch {
        if (controller.signal.aborted) return;
        setCities([]);
        setCitySearchState("error");
        return;
      }
      setCitySearchState("done");
    }, 200);
    return () => {
      controller.abort();
      window.clearTimeout(handle);
    };
  }, [cityQuery]);

  useEffect(() => {
    if (!showFilters) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    const focusPanel = window.requestAnimationFrame(() => {
      filterPanelRef.current
        ?.querySelector<HTMLElement>("button, input, [href], [tabindex]:not([tabindex='-1'])")
        ?.focus();
    });
    const handlePanelKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowFilters(false);
        return;
      }
      if (event.key !== "Tab" || !filterPanelRef.current) return;
      const focusable = Array.from(
        filterPanelRef.current.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex='-1'])",
        ),
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handlePanelKeys);
    return () => {
      window.cancelAnimationFrame(focusPanel);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handlePanelKeys);
      previousFocus?.focus();
    };
  }, [showFilters]);

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
        setSelectedCity(null);
        void loadSlice(encodeGeohash4(next.lat, next.lng), next, null);
      },
      () => setStatus("Location was denied. Search a city instead."),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    );
  }

  async function pickCity(city: City) {
    setSelectedCity(city);
    setCityQuery("");
    setCities([]);
    setCitySearchState("idle");
    setCityOpen(false);
    setOrigin({ lat: city.lat, lng: city.lng });
    await loadSlice(
      city.geohash4,
      { lat: city.lat, lng: city.lng },
      city.slug,
    );
  }

  const emptyBecauseCoverage =
    Boolean(geohash) && meetings.length === 0 && mode === "nearby";
  const emptyBecauseNoMatches = meetings.length > 0 && count === 0;
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
  const hasExplicitFilters =
    activeFilterCount > 0 || filters.query.trim().length > 0;
  const canSearchMeetings =
    mode === "online" || Boolean(geohash) || Boolean(initialMeetings);

  return (
    <div className="space-y-5">
      {mode === "nearby" ? (
        <section className="space-y-3">
          <h1 className="comic-wordmark font-display text-5xl lowercase tracking-tight sm:text-6xl">
            darkness dies at the door
          </h1>
          <ComicStrip />
          <div className="flex flex-col gap-2 sm:flex-row">
            <div
              className="relative min-w-0 flex-1 space-y-2"
              onBlur={(event) => {
                const container = event.currentTarget;
                window.requestAnimationFrame(() => {
                  if (!container.contains(document.activeElement)) {
                    setCityOpen(false);
                  }
                });
              }}
            >
              <label
                className="block text-sm font-semibold lowercase"
                htmlFor="location-search"
              >
                location
              </label>
              <Input
                id="location-search"
                value={cityQuery}
                onChange={(event) => {
                  const value = event.target.value;
                  setCityQuery(value);
                  if (value.trim().length >= 2) {
                    setCitySearchState("loading");
                    setCityOpen(true);
                  } else {
                    setCities([]);
                    setCitySearchState("idle");
                    setCityOpen(false);
                  }
                }}
                onFocus={() => {
                  if (cityQuery.trim().length >= 2) setCityOpen(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setCityOpen(false);
                }}
                placeholder="city or town"
                aria-label="Search city"
                aria-describedby="location-status"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={cityOpen}
                aria-controls="city-suggestions"
              />
              {cityOpen ? (
                <div
                  id="city-suggestions"
                  className="absolute inset-x-0 top-[calc(100%+0.35rem)] z-40 max-h-72 overflow-y-auto border-4 border-black bg-card shadow-[6px_6px_0_0_#3d8bff]"
                >
                  {citySearchState === "loading" ? (
                    <p className="px-4 py-3 text-sm text-muted">Searching cities…</p>
                  ) : citySearchState === "error" ? (
                    <p className="px-4 py-3 text-sm text-warn">
                      City search is temporarily unavailable. Try again shortly.
                    </p>
                  ) : cities.length ? (
                    <ul
                      role="listbox"
                      aria-label="City suggestions"
                      className="divide-y divide-black"
                    >
                      {cities.map((city) => (
                        <li key={city.slug}>
                          <button
                            type="button"
                            role="option"
                            aria-selected="false"
                            className="flex min-h-12 w-full items-center justify-between gap-4 px-4 text-left hover:bg-warn hover:text-black focus-visible:bg-warn focus-visible:text-black"
                            onPointerDown={(event) => {
                              // Mobile Safari moves focus before dispatching click,
                              // which can close and unmount the listbox too early.
                              event.preventDefault();
                            }}
                            onClick={() => void pickCity(city)}
                          >
                            <span className="truncate">
                              {city.label}
                              {city.state ? `, ${city.state}` : ""}
                              {city.country ? `, ${city.country}` : ""}
                            </span>
                            <span className="shrink-0 text-sm opacity-70">
                              {city.meetingCount}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="px-4 py-3 text-sm text-muted">
                      No covered cities match that search.
                    </p>
                  )}
                </div>
              ) : null}
            </div>
            <Button
              type="button"
              variant="outline"
              className="sm:self-end"
              onClick={useLocation}
            >
              use my location
            </Button>
          </div>
          <p id="location-status" className="text-sm text-muted">
            {selectedCity
              ? `${selectedCity.label} · ${status}`
              : geohash
                ? `current area · ${status}`
                : status}
          </p>
          {origin ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
                <button className="underline" onClick={() => void savePlace({ kind: "home", label: selectedCity?.label ?? "Home", geohash4: geohash ?? encodeGeohash4(origin.lat, origin.lng), lat: origin.lat, lng: origin.lng, citySlug: selectedCity?.slug })}>
                  save as home
                </button>
                <button className="underline" onClick={() => void savePlace({ kind: "work", label: selectedCity?.label ?? "Work", geohash4: geohash ?? encodeGeohash4(origin.lat, origin.lng), lat: origin.lat, lng: origin.lng, citySlug: selectedCity?.slug })}>
                  save as work
                </button>
                <button className="underline" onClick={() => void savePlace({ kind: "travel", label: selectedCity?.label ?? "Travel", geohash4: geohash ?? encodeGeohash4(origin.lat, origin.lng), lat: origin.lat, lng: origin.lng, citySlug: selectedCity?.slug })}>
                  save as travel
                </button>
            </div>
          ) : null}
          {offlineNote ? <p className="text-sm text-muted">{offlineNote}</p> : null}
        </section>
      ) : (
        <section>
          <h1 className="comic-wordmark font-display text-4xl lowercase tracking-tight sm:text-5xl">online meetings</h1>
          <p className="mt-2 text-muted">
            Times are shown in your timezone. Join links stay on this device.
          </p>
          <div className="mt-4">
            <ComicStrip compact />
          </div>
        </section>
      )}

      {canSearchMeetings ? (
        <div className="sticky top-0 z-20 space-y-2 border-y-2 border-black bg-background/95 py-3 backdrop-blur-sm">
          <label
            className="block text-sm font-semibold lowercase"
            htmlFor="meeting-search"
          >
            meeting search
          </label>
          <Input
            id="meeting-search"
            value={filters.query}
            onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
            placeholder="name, location, or meeting type"
          />
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-auto text-sm text-muted">
              {count} match{count === 1 ? "" : "es"}
            </p>
            {mode === "nearby" ? (
              <Button type="button" variant="outline" onClick={() => setShowMap((v) => !v)}>
                <Map aria-hidden="true" size={18} />
                {showMap ? "hide map" : "map"}
              </Button>
            ) : null}
            <Button
              type="button"
              variant={activeFilterCount ? "default" : "outline"}
              aria-expanded={showFilters}
              aria-controls="meeting-filters"
              onClick={() => setShowFilters(true)}
            >
              <SlidersHorizontal aria-hidden="true" size={18} />
              filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
            </Button>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className={cn(
          "fixed inset-0 z-40 cursor-default bg-black/75 transition-opacity duration-300 motion-reduce:transition-none",
          showFilters ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        aria-label="Close filters"
        tabIndex={showFilters ? 0 : -1}
        onClick={() => setShowFilters(false)}
      />

      <section
        ref={filterPanelRef}
        id="meeting-filters"
        role="dialog"
        aria-modal="true"
        aria-hidden={!showFilters}
        aria-labelledby="meeting-filters-title"
        className={cn(
          "fixed inset-y-0 right-0 z-50 w-[min(92vw,32rem)] overflow-y-auto border-l-4 border-black bg-card shadow-[-8px_0_0_0_#ff2ad4] transition-[transform,visibility] duration-300 motion-reduce:transition-none",
          showFilters ? "visible translate-x-0" : "invisible translate-x-full",
        )}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b-4 border-black bg-warn px-4 py-3 text-black">
          <div>
            <h2
              id="meeting-filters-title"
              className="font-display text-2xl lowercase tracking-tight"
            >
              filter meetings
            </h2>
            <p className="text-sm font-semibold">
              {count} match{count === 1 ? "" : "es"}
            </p>
          </div>
          <button
            type="button"
            className="grid size-12 place-items-center border-2 border-black bg-card text-foreground shadow-[3px_3px_0_0_#000]"
            aria-label="Close filters"
            onClick={() => setShowFilters(false)}
          >
            <X aria-hidden="true" size={24} />
          </button>
        </div>
        <div className="space-y-5 p-4">
        <FilterGroup label="fellowship">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {(["all", "aa", "na", "ca"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={filters.fellowship === value}
                className={cn(
                  "min-h-12 shrink-0 border-2 border-black px-3 text-sm font-semibold lowercase tracking-wide shadow-[3px_3px_0_0_#000]",
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
                {value === "all" ? "all" : FELLOWSHIP_LABEL[value]}
              </button>
            ))}
          </div>
        </FilterGroup>

        <FilterGroup label="attendance">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {(["in-person", "online", "either"] as const).map((value) => (
              <Button
                key={value}
                className="shrink-0"
                variant={filters.attendance === value ? "default" : "outline"}
                onClick={() => setFilters((f) => ({ ...f, attendance: value }))}
              >
                {value === "in-person" ? "in person" : value === "online" ? "online" : "either"}
              </Button>
            ))}
          </div>
        </FilterGroup>

        <FilterGroup label="day">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {DAYS.map((day) => (
              <button
                key={String(day.value)}
                className={cn(
                  "min-h-12 shrink-0 border-2 border-black px-3 text-sm font-semibold lowercase shadow-[3px_3px_0_0_#000]",
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
                "min-h-12 shrink-0 border-2 border-black px-3 text-sm font-semibold lowercase shadow-[3px_3px_0_0_#000]",
                filters.week ? "bg-hot text-black" : "bg-card text-foreground",
              )}
              onClick={() => setFilters((f) => ({ ...f, week: !f.week, day: f.week ? "today" : "any" }))}
            >
              rest of week
            </button>
          </div>
        </FilterGroup>

        <FilterGroup label="time">
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

        <FilterGroup label="access">
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
                {value === "O" ? "open" : "closed"}
              </Chip>
            ))}
          </div>
        </FilterGroup>

        <FilterGroup label="meeting type">
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
          <FilterGroup label="distance">
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

        <div className="flex flex-wrap justify-end gap-2 border-t-2 border-black pt-4">
          <Button type="button" variant="outline" onClick={() => setFilters(defaultFilters)}>
            reset filters
          </Button>
          <Button type="button" onClick={() => setShowFilters(false)}>
            show {count} match{count === 1 ? "" : "es"}
          </Button>
        </div>
        </div>
      </section>

      {showMap ? <MeetingMap meetings={flat} origin={origin} /> : null}

      {emptyBecauseCoverage ? (
        <EmptyCoverage city={selectedCity?.label} />
      ) : emptyBecauseNoMatches ? (
        <div className="comic-frame space-y-3 bg-card p-4">
          <p className="font-semibold text-warn">
            {hasExplicitFilters
              ? "No meetings match your current search and filters."
              : mode === "nearby"
                ? `No meetings match today within ${filters.radiusKm} km.`
                : "No online meetings match today."}
          </p>
          <p className="text-sm text-muted">
            There are still {meetings.length} listings in this area. Show more
            days, widen the distance, or clear your choices.
          </p>
          <div className="flex flex-wrap gap-2">
            {hasExplicitFilters ? (
              <Button type="button" variant="outline" onClick={() => setFilters(defaultFilters)}>
                clear filters
              </Button>
            ) : null}
            {!filters.week || filters.day !== "any" ? (
              <Button
                type="button"
                onClick={() =>
                  setFilters((current) => ({
                    ...current,
                    day: "any",
                    week: true,
                  }))
                }
              >
                show rest of week
              </Button>
            ) : null}
            {mode === "nearby" && filters.radiusKm < 50 ? (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setFilters((current) => ({ ...current, radiusKm: 50 }))
                }
              >
                expand to 50 km
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          <Group title="happening now" items={groups.happening} />
          <Group title="starting within 2 hours" items={groups.soon} />
          <Group title="later today" items={groups.later} />
          {filters.week || filters.day === "any" ? (
            <Group title="rest of the week" items={groups.week} showDay />
          ) : null}
        </div>
      )}
    </div>
  );
}

const chipClass =
  "min-h-12 border-2 border-black bg-card px-3 text-sm font-semibold lowercase text-foreground shadow-[3px_3px_0_0_#000]";
const chipActiveClass =
  "min-h-12 border-2 border-black bg-warn px-3 text-sm font-semibold lowercase text-black shadow-[3px_3px_0_0_#000]";

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
      <h2 className="text-xs font-bold lowercase tracking-widest text-muted">{label}</h2>
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
      <h2 className="font-display text-2xl lowercase tracking-tight text-warn">{title}</h2>
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
          <Button>see online meetings</Button>
        </a>
        <a href="/coverage">
          <Button variant="outline">coverage map</Button>
        </a>
      </div>
    </div>
  );
}

