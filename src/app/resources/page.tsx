import Link from "next/link";
import { ComicStrip } from "@/components/comic-strip";

export default function ResourcesPage() {
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
  return (
    <article className="space-y-6">
      <h1 className="comic-wordmark font-display text-5xl uppercase tracking-tight">Resources</h1>
      <ComicStrip compact />
      <p className="text-muted">
        Original guidance for finding a meeting. This is not A.A., N.A., or C.A.
        literature.
      </p>
      <section className="space-y-2 border-4 border-black bg-warn p-4 text-black">
        <h2 className="font-display text-xl lowercase">if this is an emergency</h2>
        <p>
          This meeting finder is not an emergency or medical service. If you or
          someone else is in immediate danger, call your local emergency number.
          In the U.S. or Canada, call or text 988. In the UK or Republic of
          Ireland, Samaritans can be reached at 116 123.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-medium">What to expect</h2>
        <p>
          Most meetings last about an hour. Arrive a few minutes early if you
          can. You do not need to speak. Open meetings usually welcome anyone
          interested. Closed meetings are for people who identify with that
          fellowship.
        </p>
        <p>
          Online meetings usually share a link or phone number. Join muted, and
          follow any notes on the listing. If a door code or buzzer is listed,
          that is often the difference between finding the room and walking past
          it.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-medium">Official sites</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <a className="underline" href="https://www.aa.org">
              aa.org
            </a>{" "}
            — Alcoholics Anonymous World Services
          </li>
          <li>
            <a className="underline" href="https://www.alcoholics-anonymous.org.uk">
              alcoholics-anonymous.org.uk
            </a>{" "}
            — A.A. Great Britain
          </li>
          <li>
            <a className="underline" href="https://www.na.org">
              na.org
            </a>{" "}
            — Narcotics Anonymous World Services
          </li>
          <li>
            <a className="underline" href="https://www.ukna.org">
              ukna.org
            </a>{" "}
            — Narcotics Anonymous UK
          </li>
          <li>
            <a className="underline" href="https://ca.org">
              ca.org
            </a>{" "}
            — Cocaine Anonymous World Services
          </li>
          <li>
            <a className="underline" href="https://meetings.cocaineanonymous.org.uk/meetings/">
              meetings.cocaineanonymous.org.uk
            </a>{" "}
            — C.A. UK meetings
          </li>
          <li>
            <Link className="underline" href="/contact">
              Local contacts
            </Link>{" "}
            from the offices that publish these feeds
          </li>
        </ul>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-medium">Privacy</h2>
        <p>
          blood against blackout does not create accounts. Your precise location stays on
          this device. Favorites and Home/Work/Travel places are stored in this
          browser only.
        </p>
        <p>
          The map loads tiles from MapTiler only after you choose to show it.
          MapTiler receives the visible map area and standard request metadata;
          blood against blackout does not send it an account identity.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-medium">Listings, corrections, and takedowns</h2>
        <p>
          Meeting details come from public feeds maintained by local service
          entities. The source office remains responsible for its listing.
          Use the report link on a meeting when available.
        </p>
        {supportEmail ? (
          <p>
            For privacy questions, artwork rights, corrections, or takedown
            requests, email{" "}
            <a className="text-cool underline" href={`mailto:${supportEmail}`}>
              {supportEmail}
            </a>
            .
          </p>
        ) : (
          <p className="text-warn">
            Operator support contact will be published before production launch.
          </p>
        )}
      </section>
    </article>
  );
}
