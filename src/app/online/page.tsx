import { Suspense } from "react";
import { Finder } from "@/components/finder";

export default function OnlinePage() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Finder mode="online" />
    </Suspense>
  );
}
