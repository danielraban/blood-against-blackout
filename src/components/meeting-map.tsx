"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { RankedMeeting } from "@/lib/search";

const mapTilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY;

export function MeetingMap({
  meetings,
  origin,
}: {
  meetings: RankedMeeting[];
  origin: { lat: number; lng: number } | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    if (!mapTilerKey) return;
    const center: [number, number] = origin
      ? [origin.lng, origin.lat]
      : [-0.12, 51.5];
    const map = new maplibregl.Map({
      container: ref.current,
      style: `https://api.maptiler.com/maps/streets-v2-dark/style.json?key=${encodeURIComponent(mapTilerKey)}`,
      center,
      zoom: 11,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [origin]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers: maplibregl.Marker[] = [];
    const withCoords = meetings.filter(
      (m) => m.lat != null && m.lng != null && m.attendance !== "online",
    );
    for (const meeting of withCoords.slice(0, 200)) {
      const el = document.createElement("a");
      el.href = `/meetings/${meeting.feedId}/${meeting.slug}`;
      el.className =
        "block h-3 w-3 border-2 border-black bg-[#ffe600]";
      el.title = meeting.name;
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([meeting.lng!, meeting.lat!])
        .addTo(map);
      markers.push(marker);
    }
    if (origin) {
      map.jumpTo({ center: [origin.lng, origin.lat], zoom: 11 });
    } else if (withCoords[0]) {
      map.jumpTo({
        center: [withCoords[0].lng!, withCoords[0].lat!],
        zoom: 10,
      });
    }
    return () => {
      for (const marker of markers) marker.remove();
    };
  }, [meetings, origin]);

  return (
    <div className="border-2 border-border bg-card">
      {!mapTilerKey ? (
        <p className="p-4 text-sm text-warn">
          Map tiles are not configured. Meeting lists and directions still work.
        </p>
      ) : null}
      <div
        ref={ref}
        className={mapTilerKey ? "h-64 w-full overflow-hidden md:h-[28rem]" : "hidden"}
      />
    </div>
  );
}
