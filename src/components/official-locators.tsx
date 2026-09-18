export const OFFICIAL_LOCATORS = [
  {
    href: "https://www.aa.org/aa-near-you",
    label: "aa.org / A.A. Near You",
  },
  {
    href: "https://www.alcoholics-anonymous.org.uk/AA-Meetings/Find-a-Meeting",
    label: "UK A.A. GSO locator",
  },
  {
    href: "https://www.na.org/meeting-search/",
    label: "na.org meeting search",
  },
  {
    href: "https://www.ukna.org",
    label: "UK NA",
  },
  {
    href: "https://ca.org",
    label: "ca.org",
  },
  {
    href: "https://meetings.cocaineanonymous.org.uk/meetings/",
    label: "UK C.A. meetings",
  },
] as const;

export function OfficialLocators({
  intro = "If a public JSON feed is missing, use the official locator for that fellowship instead of assuming there are no meetings.",
}: {
  intro?: string;
}) {
  return (
    <div className="space-y-2 text-sm text-muted">
      <p>{intro}</p>
      <ul className="list-disc space-y-1 pl-5">
        {OFFICIAL_LOCATORS.map((locator) => (
          <li key={locator.href}>
            <a className="underline" href={locator.href} rel="noreferrer" target="_blank">
              {locator.label}
            </a>
          </li>
        ))}
      </ul>
      <p>
        Intergroups can publish the same Meeting Guide JSON this app already
        ingests: add{" "}
        <code className="text-foreground">{`<link rel="alternate" type="application/json" title="Meetings Feed">`}</code>{" "}
        on the office website.
      </p>
    </div>
  );
}
