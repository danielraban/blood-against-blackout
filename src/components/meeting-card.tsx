"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { FellowshipBadge } from "@/components/fellowship-badge";
import type { RankedMeeting } from "@/lib/search";
import { formatDistance, formatTime, formatUntil, isStale, weekdayLabel } from "@/lib/search";
import { labelForType } from "@/lib/spec";

export function MeetingCard({
  meeting,
  showDay,
}: {
  meeting: RankedMeeting;
  showDay?: boolean;
}) {
  const href = `/meetings/${meeting.feedId}/${meeting.slug}`;
  const distance =
    meeting.attendance === "online" ? null : formatDistance(meeting.distanceKm);
  const until = formatUntil(
    meeting.minutesUntilStart,
    meeting.inProgress,
    meeting.daysUntil,
  );
  return (
    <Link
      href={href}
      className="block border-4 border-black bg-card p-4 shadow-[8px_8px_0_0_#000] hover:shadow-[10px_10px_0_0_var(--hot)] focus-visible:shadow-[10px_10px_0_0_var(--hot)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-medium leading-snug">{meeting.name}</p>
          <p className="mt-1 text-sm text-muted">
            {showDay && meeting.day != null ? `${weekdayLabel(meeting.day)} · ` : ""}
            {formatTime(meeting.time)}
            {meeting.locationName ? ` · ${meeting.locationName}` : ""}
            {meeting.neighborhood ? ` · ${meeting.neighborhood}` : ""}
            {meeting.city ? ` · ${meeting.city}` : ""}
          </p>
        </div>
        <div className="shrink-0 whitespace-nowrap text-right text-sm">
          {until ? <p className="font-semibold text-warn">{until}</p> : null}
          {distance ? <p className="text-muted">{distance}</p> : null}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <FellowshipBadge fellowship={meeting.fellowship} />
        <Badge>{meeting.attendance}</Badge>
        {meeting.inProgress ? <Badge className="border-black bg-hot text-accent-fg">Now</Badge> : null}
        {isStale(meeting.sourceVerifiedAt) ? <Badge>listing may be old</Badge> : null}
        {meeting.types.slice(0, 4).map((type) => (
          <Badge key={type}>{labelForType(type)}</Badge>
        ))}
      </div>
    </Link>
  );
}
