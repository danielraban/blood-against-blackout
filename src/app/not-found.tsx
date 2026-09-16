import Link from "next/link";

export default function NotFoundPage() {
  return (
    <section className="comic-frame space-y-4 bg-card p-6">
      <h1 className="comic-wordmark font-display text-4xl lowercase">
        no door here
      </h1>
      <p>This page is gone, but the meeting finder is still open.</p>
      <Link className="inline-flex min-h-12 items-center border-2 border-black bg-warn px-4 font-semibold text-black" href="/">
        Find a meeting
      </Link>
    </section>
  );
}
