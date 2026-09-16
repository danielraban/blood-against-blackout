import Link from "next/link";
import { BottomNav } from "./bottom-nav";
import { InstallHint } from "./install-hint";
import { ServiceWorkerRegistration } from "./service-worker-registration";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto flex min-h-dvh max-w-6xl flex-col px-4">
      <div className="comic-wallpaper" aria-hidden>
        <div className="comic-wallpaper-grid">
          <span className="bg-[url('/art/panel-map.jpg')]" />
          <span className="bg-[url('/art/panel-walk.jpg')]" />
          <span className="bg-[url('/art/panel-break.jpg')]" />
          <span className="bg-[url('/art/panel-door.jpg')]" />
        </div>
      </div>
      <div className="neon-bar -mx-4 h-2" aria-hidden />
      <header className="flex min-h-16 items-center justify-between gap-4 border-b-4 border-black py-3">
        <Link href="/" className="comic-wordmark font-display text-2xl lowercase tracking-tight sm:text-3xl">
          blood against blackout
        </Link>
        <p className="hidden max-w-xs text-right text-sm font-semibold text-cool sm:block">
          seek the meeting. starve the machine.
        </p>
      </header>
      <main className="flex-1 pb-28 pt-4">{children}</main>
      <footer className="border-t-4 border-black pt-6 pb-[calc(5.75rem+env(safe-area-inset-bottom))] text-sm text-muted">
        <p>
          blood against blackout is an independent project. It is not affiliated with, nor
          endorsed by, Alcoholics Anonymous World Services, Narcotics Anonymous
          World Services, Cocaine Anonymous World Services, or the Meeting Guide
          app. Listings come from local service entities that publish public
          feeds. Official sites:{" "}
          <a className="text-warn underline" href="https://www.aa.org">
            aa.org
          </a>
          ,{" "}
          <a className="text-warn underline" href="https://www.na.org">
            na.org
          </a>
          ,{" "}
          <a className="text-warn underline" href="https://ca.org">
            ca.org
          </a>
          .
        </p>
        <p className="mt-2">
          <Link className="text-cool underline" href="/coverage">
            Coverage
          </Link>
          {" · "}
          <Link className="text-cool underline" href="/contact">
            Local contacts
          </Link>
          {" · "}
          <Link className="text-cool underline" href="/admin/feeds">
            Feeds
          </Link>
        </p>
      </footer>
      <InstallHint />
      <ServiceWorkerRegistration />
      <BottomNav />
    </div>
  );
}
