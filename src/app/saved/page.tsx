"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MeetingCard } from "@/components/meeting-card";
import { Button } from "@/components/ui/button";
import { listFavorites, listPlaces } from "@/lib/idb";
import type { SavedPlace } from "@/lib/idb";
import type { Meeting } from "@/lib/types";
import { filterAndGroup } from "@/lib/search";
import { DEFAULT_FILTERS } from "@/lib/types";

export default function SavedPage() {
  const [favorites, setFavorites] = useState<Meeting[]>([]);
  const [places, setPlaces] = useState<SavedPlace[]>([]);

  useEffect(() => {
    void listFavorites().then(setFavorites);
    void listPlaces().then(setPlaces);
  }, []);

  const ranked = filterAndGroup(
    favorites,
    { ...DEFAULT_FILTERS, day: "any", week: true, radiusKm: 500 },
    null,
  );

  return (
    <div className="space-y-6">
      <h1 className="comic-wordmark font-display text-4xl lowercase tracking-tight sm:text-5xl">saved</h1>
      <section className="space-y-3">
        <h2 className="text-xl font-medium lowercase">places</h2>
        {places.length === 0 ? (
          <p className="text-muted">
            Save Home, Work, or Travel from Nearby so you are not stuck waiting
            on GPS.
          </p>
        ) : (
          <ul className="space-y-2">
            {places.map((place) => (
              <li key={place.kind}>
                <Link href={`/?gh=${place.geohash4}`}>
                  <Button variant="outline" className="w-full justify-between">
                    <span>{place.kind}</span>
                    <span className="text-muted">{place.label}</span>
                  </Button>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-medium lowercase">favorite meetings</h2>
        {favorites.length === 0 ? (
          <p className="text-muted">Favorites stay on this device only.</p>
        ) : (
          <ul className="space-y-3">
            {[
              ...ranked.groups.happening,
              ...ranked.groups.soon,
              ...ranked.groups.later,
              ...ranked.groups.week,
              ...ranked.groups.other,
            ].map((meeting) => (
              <li key={`${meeting.feedId}:${meeting.slug}`}>
                <MeetingCard meeting={meeting} showDay />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
