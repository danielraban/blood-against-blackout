"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("app.render.failed", {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <section className="comic-frame space-y-4 bg-card p-6">
      <h1 className="comic-wordmark font-display text-4xl lowercase">
        the signal broke
      </h1>
      <p>
        We could not load this screen. Your saved meetings remain on this device.
      </p>
      <Button onClick={reset}>Try again</Button>
    </section>
  );
}
