"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  downloadIcs,
  mapsUrl,
  openJoin,
  reportMailto,
} from "@/lib/actions";
import { isFavorite, toggleFavorite } from "@/lib/idb";
import { formatTime, isStale, weekdayLabel } from "@/lib/search";
import { labelForType } from "@/lib/spec";
import { FELLOWSHIP_LABEL, FELLOWSHIP_NAME } from "@/lib/fellowship";
import type { Meeting } from "@/lib/types";
import { cn } from "@/lib/utils";

export function MeetingDetail({ meeting }: { meeting: Meeting }) {
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    void isFavorite(meeting).then(setSaved);
  }, [meeting]);

  const report = reportMailto(meeting.feedbackEmails, meeting.name);
  const sharePath = `/meetings/${meeting.feedId}/${meeting.slug}`;

  return (
    <article className="space-y-5">
      <p className="text-sm text-muted">
        <Link href="/" className="underline">
          nearby
        </Link>
      </p>
      <h1 className="comic-wordmark font-display text-4xl tracking-tight">{meeting.name}</h1>
      <p className="text-lg text-muted">
        {meeting.day != null ? `${weekdayLabel(meeting.day)} · ` : ""}
        {formatTime(meeting.time)}
        {meeting.endTime ? `–${formatTime(meeting.endTime)}` : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        <Badge
          className={cn(
            "border-black font-semibold lowercase",
            meeting.fellowship === "na"
              ? "bg-hot text-black"
              : meeting.fellowship === "ca"
                ? "bg-cool text-black"
                : "bg-accent text-accent-fg",
          )}
        >
          {FELLOWSHIP_LABEL[meeting.fellowship ?? "aa"]}
        </Badge>
        <Badge>{meeting.attendance}</Badge>
        {isStale(meeting.updatedAt) ? <Badge>listing may be old</Badge> : null}
        {meeting.types.map((type) => (
          <Badge key={type}>{labelForType(type)}</Badge>
        ))}
      </div>
      {meeting.locationName ? <p>{meeting.locationName}</p> : null}
      {meeting.formattedAddress ? (
        <p className="text-muted">{meeting.formattedAddress}</p>
      ) : null}
      {meeting.notes ? <p className="whitespace-pre-wrap">{meeting.notes}</p> : null}
      {meeting.locationNotes ? (
        <p className="whitespace-pre-wrap text-muted">{meeting.locationNotes}</p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {meeting.conferenceUrl ? (
          <Button onClick={() => openJoin(meeting.conferenceUrl!)}>join</Button>
        ) : null}
        {meeting.lat != null && meeting.lng != null ? (
          <a
            href={mapsUrl(meeting.lat, meeting.lng, meeting.name)}
            target="_blank"
            rel="noreferrer"
          >
            <Button variant="outline">directions</Button>
          </a>
        ) : null}
        <Button
          variant="outline"
          onClick={() =>
            downloadIcs({
              name: meeting.name,
              day: meeting.day,
              time: meeting.time,
              endTime: meeting.endTime,
              location: meeting.formattedAddress,
              notes: meeting.notes,
            })
          }
        >
          add to calendar
        </Button>
        <Button
          variant={saved ? "default" : "outline"}
          onClick={async () => setSaved(await toggleFavorite(meeting))}
        >
          {saved ? "saved" : "save"}
        </Button>
        <Button
          variant="outline"
          onClick={async () => {
            const url = `${window.location.origin}${sharePath}`;
            if (navigator.share) {
              await navigator.share({ title: meeting.name, url });
            } else {
              await navigator.clipboard.writeText(url);
            }
          }}
        >
          share
        </Button>
        {report ? (
          <a href={report}>
            <Button variant="outline">report a problem</Button>
          </a>
        ) : null}
      </div>

      <section className="border-2 border-border p-4 text-sm">
        <p className="font-medium">Who supplied this listing</p>
        <p className="mt-1 text-muted">
          {FELLOWSHIP_NAME[meeting.fellowship ?? "aa"]} · {meeting.entityName ?? meeting.feedId}
        </p>
        {meeting.entityPhone ? <p>{meeting.entityPhone}</p> : null}
        {meeting.entityUrl ? (
          <a className="underline" href={meeting.entityUrl}>
            {meeting.entityUrl}
          </a>
        ) : null}
        {meeting.updatedAt ? (
          <p className="mt-2 text-muted">
            Last updated in the feed: {new Date(meeting.updatedAt).toLocaleString()}
          </p>
        ) : (
          <p className="mt-2 text-muted">No last-updated date in the feed.</p>
        )}
      </section>
    </article>
  );
}
