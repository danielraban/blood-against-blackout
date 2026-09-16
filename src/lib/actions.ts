export function openJoin(url: string) {
  if (/zoom\.us/i.test(url)) {
    const native = url.replace(/^https?:\/\//, "zoomus://");
    window.location.href = native;
    window.setTimeout(() => {
      window.open(url, "_blank", "noopener,noreferrer");
    }, 700);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export function directionsUrl(lat: number, lng: number) {
  return `https://www.openstreetmap.org/directions?to=${lat}%2C${lng}`;
}

export function mapsUrl(lat: number, lng: number, label: string) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}(${encodeURIComponent(label)})`;
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function nextDateForDay(day: number, time: string) {
  const now = new Date();
  const [h, m] = time.split(":").map(Number);
  const result = new Date(now);
  const delta = (day - now.getDay() + 7) % 7;
  result.setDate(now.getDate() + delta);
  result.setHours(h, m, 0, 0);
  if (result < now) result.setDate(result.getDate() + 7);
  return result;
}

function icsStamp(date: Date) {
  return (
    date.getUTCFullYear().toString() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    "T" +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    "Z"
  );
}

export function downloadIcs(input: {
  name: string;
  day: number | null;
  time: string | null;
  endTime: string | null;
  location: string | null;
  notes: string | null;
}) {
  if (input.day == null || !input.time) return;
  const start = nextDateForDay(input.day, input.time);
  const end = new Date(start);
  if (input.endTime) {
    const [h, m] = input.endTime.split(":").map(Number);
    end.setHours(h, m, 0, 0);
    if (end <= start) end.setDate(end.getDate() + 1);
  } else {
    end.setHours(end.getHours() + 1);
  }
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//blood against blackout//EN",
    "BEGIN:VEVENT",
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${input.name.replace(/\n/g, " ")}`,
    input.location ? `LOCATION:${input.location.replace(/\n/g, " ")}` : "",
    input.notes ? `DESCRIPTION:${input.notes.replace(/\n/g, " ")}` : "",
    "RRULE:FREQ=WEEKLY",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
  const blob = new Blob([ics], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${input.name}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

export function reportMailto(emails: string[], name: string) {
  if (!emails.length) return null;
  const subject = encodeURIComponent(`Meeting listing correction: ${name}`);
  const body = encodeURIComponent(
    `This listing may be wrong or out of date:\n\n${name}\n\nWhat needs changing:\n`,
  );
  return `mailto:${emails.join(",")}?subject=${subject}&body=${body}`;
}
