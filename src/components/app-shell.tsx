import { Suspense } from "react";
import Link from "next/link";
import { BottomNav } from "./bottom-nav";
import { InstallHint } from "./install-hint";
import { ServiceWorkerRegistration } from "./service-worker-registration";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto flex min-h-dvh max-w-6xl flex-col px-4">
      <div className="neon-bar -mx-4 h-3" aria-hidden />
      <header className="flex min-h-16 items-center justify-between gap-4 border-b-4 border-black py-3">
        <Link href="/" className="comic-wordmark font-display text-2xl lowercase tracking-wide sm:text-3xl">
          blood against blackout
        </Link>
        <p className="hidden max-w-xs text-right text-sm font-semibold text-muted sm:block">
          seek the meeting. starve the machine.
        </p>
      </header>
      <main className="flex-1 pb-28 pt-4">
        <Suspense fallback={<p>Loading…</p>}>{children}</Suspense>
      </main>
      <footer className="border-t-4 border-black pt-6 pb-[calc(5.75rem+env(safe-area-inset-bottom))] text-sm text-muted">
        <p>
          blood against blackout is an independent project. It is not affiliated with, nor
          endorsed by, Alcoholics Anonymous World Services, Narcotics Anonymous
          World Services, Cocaine Anonymous World Services, or the Meeting Guide
          app. Listings come from local service entities that publish public
          feeds. Official sites:{" "}
          <a className="underline" href="https://www.aa.org">
            aa.org
          </a>
          ,{" "}
          <a className="underline" href="https://www.na.org">
            na.org
          </a>
          ,{" "}
          <a className="underline" href="https://ca.org">
            ca.org
          </a>
          .
        </p>
        <p className="mt-2">
          <Link className="underline" href="/coverage">
            Coverage
          </Link>
          {" · "}
          <Link className="underline" href="/contact">
            Local contacts
          </Link>
          {" · "}
          <Link className="underline" href="/admin/feeds">
            Feeds
          </Link>
        </p>
      </footer>
      <InstallHint />
      <ServiceWorkerRegistration />
      <Suspense fallback={null}>
        <BottomNav />
      </Suspense>
    </div>
  );
}
