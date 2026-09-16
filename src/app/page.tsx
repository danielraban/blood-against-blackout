import { Suspense } from "react";
import { Finder } from "@/components/finder";

export default function HomePage() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Finder />
    </Suspense>
  );
}
