import { Suspense } from "react";
import { notFound } from "next/navigation";
import { MeetingDetail } from "@/components/meeting-detail";
import { getMeeting } from "@/lib/meetings";

export default function MeetingPage({
  params,
}: {
  params: Promise<{ feedId: string; slug: string }>;
}) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <MeetingPageContent params={params} />
    </Suspense>
  );
}

async function MeetingPageContent({
  params,
}: {
  params: Promise<{ feedId: string; slug: string }>;
}) {
  const { feedId, slug } = await params;
  const meeting = await getMeeting(feedId, slug);
  if (!meeting) notFound();
  return <MeetingDetail meeting={meeting} />;
}
