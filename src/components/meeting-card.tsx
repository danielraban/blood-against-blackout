"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { RankedMeeting } from "@/lib/search";
import { formatDistance, formatTime, formatUntil, isStale, weekdayLabel } from "@/lib/search";
import { labelForType } from "@/lib/spec";
import { FELLOWSHIP_LABEL } from "@/lib/fellowship";
import { cn } from "@/lib/utils";

export function MeetingCard({
  meeting,
  showDay,
}: {
  meeting: RankedMeeting;
  showDay?: boolean;
}) {
  const href = `/meetings/${meeting.feedId}/${meeting.slug}`;
  const distance = formatDistance(meeting.distanceKm);
  const until = formatUntil(meeting.minutesUntilStart, meeting.inProgress);
  return (
    <Link
      href={href}
      className="block border-4 border-black bg-card p-4 shadow-[6px_6px_0_0_#ff2ad4] hover:shadow-[8px_8px_0_0_#ffe600] focus-visible:shadow-[8px_8px_0_0_#ffe600]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-medium leading-snug">{meeting.name}</p>
          <p className="mt-1 text-sm text-muted">
            {showDay && meeting.day != null ? `${weekdayLabel(meeting.day)} · ` : ""}
            {formatTime(meeting.time)}
            {meeting.locationName ? ` · ${meeting.locationName}` : ""}
            {meeting.city ? ` · ${meeting.city}` : ""}
          </p>
        </div>
        <div className="text-right text-sm">
          {until ? <p className="font-semibold text-warn">{until}</p> : null}
          {distance ? <p className="text-muted">{distance}</p> : null}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
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
        {meeting.inProgress ? <Badge className="border-black bg-warn text-black">now</Badge> : null}
        {isStale(meeting.sourceVerifiedAt) ? <Badge>listing may be old</Badge> : null}
        {meeting.types.slice(0, 4).map((type) => (
          <Badge key={type}>{labelForType(type)}</Badge>
        ))}
      </div>
    </Link>
  );
}
