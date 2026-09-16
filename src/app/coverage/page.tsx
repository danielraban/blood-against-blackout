"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MeetingMap } from "@/components/meeting-map";
import type { RankedMeeting } from "@/lib/search";

type Coverage = {
  feeds: {
    id: string;
    name: string;
    status: string;
    meetingCount: number;
    regionHint: string | null;
    fellowship?: string;
  }[];
  cities: {
    slug: string;
    label: string;
    country: string | null;
    meetingCount: number;
    lat: number;
    lng: number;
    geohash4: string;
  }[];
};

export default function CoveragePage() {
  const [data, setData] = useState<Coverage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/coverage");
      if (!response.ok) {
        setError("Coverage is empty until the first ingest runs.");
        return;
      }
      setData(await response.json());
    })();
  }, []);

  const points: RankedMeeting[] =
    data?.cities.map((city) => ({
      feedId: "coverage",
      slug: city.slug,
      name: city.label,
      groupName: null,
      day: null,
      time: null,
      endTime: null,
      timezone: null,
      types: [],
      attendance: "in-person",
      fellowship: "aa",
      locationName: city.label,
      address: null,
      city: city.label,
      state: null,
      postalCode: null,
      country: city.country,
      formattedAddress: city.label,
      lat: city.lat,
      lng: city.lng,
      geohash4: city.geohash4,
      conferenceUrl: null,
      conferencePhone: null,
      notes: null,
      locationNotes: null,
      updatedAt: null,
      entityId: null,
      entityName: null,
      entityPhone: null,
      entityEmail: null,
      entityUrl: null,
      feedbackEmails: [],
      distanceKm: null,
      minutesUntilStart: null,
      inProgress: false,
      group: "other",
      nextDay: null,
    })) ?? [];

  return (
    <div className="space-y-5">
      <h1 className="comic-wordmark font-display text-4xl lowercase tracking-tight sm:text-5xl">coverage</h1>
      <p className="text-muted">
        blood against blackout only lists meetings from public Meeting Guide / TSML / BMLT
        JSON feeds for A.A., N.A., and C.A. If a city is missing, the local office
        has not published a feed we can ingest — not that there are no meetings.
        UK GSO, UKNA, and CAUK locators are not public JSON feeds, so we link to
        them instead of scraping.
      </p>
      {error ? <p>{error}</p> : null}
      {points.length ? <MeetingMap meetings={points} origin={null} /> : null}
      <section>
        <h2 className="text-xl font-medium lowercase">cities with listings</h2>
        <ul className="mt-3 divide-y divide-black border-4 border-black bg-card shadow-[6px_6px_0_0_#ff2ad4]">
          {(data?.cities ?? []).slice(0, 80).map((city) => (
            <li key={city.slug}>
              <Link
                className="flex min-h-12 items-center justify-between px-4"
                href={`/?city=${city.slug}&gh=${city.geohash4}`}
              >
                <span>
                  {city.label}
                  {city.country ? `, ${city.country}` : ""}
                </span>
                <span className="text-muted">{city.meetingCount}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="text-xl font-medium lowercase">feeds</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {(data?.feeds ?? []).map((feed) => (
            <li key={feed.id} className="border-4 border-black bg-card p-3 shadow-[4px_4px_0_0_#3d8bff]">
              <p className="font-medium">{feed.name}</p>
              <p className="text-muted">
                {feed.status} · {feed.meetingCount} meetings
                {feed.regionHint ? ` · ${feed.regionHint}` : ""}
                {"fellowship" in feed && feed.fellowship
                  ? ` · ${String(feed.fellowship).toUpperCase()}`
                  : ""}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
