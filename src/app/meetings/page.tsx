import { Suspense } from "react";
import { Finder } from "@/components/finder";

export default function MeetingsPage() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Finder />
    </Suspense>
  );
}
