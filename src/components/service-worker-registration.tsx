"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error) => {
      console.error("service-worker.registration.failed", error);
    });
  }, []);

  return null;
}
