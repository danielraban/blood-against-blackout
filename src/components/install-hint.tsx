"use client";

import { useEffect, useState } from "react";

export function InstallHint() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const handle = window.requestAnimationFrame(() => {
      const standalone = window.matchMedia("(display-mode: standalone)").matches;
      if (!standalone && !localStorage.getItem("oc-install-dismissed")) {
        setShow(true);
      }
    });
    return () => window.cancelAnimationFrame(handle);
  }, []);
  if (!show) return null;
  return (
    <div className="comic-frame fixed bottom-20 left-4 right-4 z-30 mx-auto max-w-6xl bg-card p-4 text-sm">
      <p className="font-medium lowercase text-foreground">
        add blood against blackout to your home screen
      </p>
      <p className="mt-1 text-muted">
        On iPhone: Share, then Add to Home Screen. On Android: the browser menu,
        then Install app.
      </p>
      <button
        className="mt-3 min-h-12 text-accent"
        onClick={() => {
          localStorage.setItem("oc-install-dismissed", "1");
          setShow(false);
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
