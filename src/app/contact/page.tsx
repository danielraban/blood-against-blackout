"use client";

import { useCallback, useEffect, useState } from "react";
import { encodeGeohash4 } from "@/lib/geo";

type Entity = {
  name: string;
  phone: string | null;
  email: string | null;
  url: string | null;
  locationText: string | null;
};

export default function ContactPage() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [status, setStatus] = useState("Choose a city on Nearby, or use location to load local offices.");

  const load = useCallback(async (hash: string) => {
    setStatus("Loading local offices…");
    const response = await fetch(`/api/slices/${hash}`);
    if (!response.ok) {
      setStatus("Could not load this area.");
      return;
    }
    const data = await response.json();
    const unique = new Map<string, Entity>();
    for (const meeting of data.meetings ?? []) {
      if (!meeting.entityName) continue;
      unique.set(meeting.entityName, {
        name: meeting.entityName,
        phone: meeting.entityPhone,
        email: meeting.entityEmail,
        url: meeting.entityUrl,
        locationText: null,
      });
    }
    setEntities([...unique.values()]);
    setStatus(
      unique.size
        ? "These contacts come from the public feeds covering this area."
        : "No local office contact was attached to listings here.",
    );
  }, []);

  useEffect(() => {
    const gh = new URLSearchParams(window.location.search).get("gh");
    if (gh) {
      const handle = window.setTimeout(() => void load(gh), 0);
      return () => window.clearTimeout(handle);
    }
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void load(encodeGeohash4(pos.coords.latitude, pos.coords.longitude));
      },
      () => setStatus("Location denied. Open Nearby, pick a city, then come back from Coverage."),
    );
  }, [load]);

  return (
    <div className="space-y-4">
      <h1 className="comic-wordmark font-display text-4xl lowercase tracking-tight sm:text-5xl">local contacts</h1>
      <p className="text-muted">{status}</p>
      <ul className="space-y-3">
        {entities.map((entity) => (
          <li key={entity.name} className="rounded-2xl border border-border p-4">
            <p className="font-medium">{entity.name}</p>
            {entity.phone ? <p>{entity.phone}</p> : null}
            {entity.email ? (
              <a className="underline" href={`mailto:${entity.email}`}>
                {entity.email}
              </a>
            ) : null}
            {entity.url ? (
              <p>
                <a className="underline" href={entity.url}>
                  {entity.url}
                </a>
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
