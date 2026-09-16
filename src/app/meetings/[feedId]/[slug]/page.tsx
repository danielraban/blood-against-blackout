import { notFound } from "next/navigation";
import { MeetingDetail } from "@/components/meeting-detail";
import { getMeeting } from "@/lib/meetings";

export default async function MeetingPage({
  params,
}: {
  params: Promise<{ feedId: string; slug: string }>;
}) {
  const { feedId, slug } = await params;
  const meeting = await getMeeting(feedId, slug);
  if (!meeting) notFound();
  return <MeetingDetail meeting={meeting} />;
}
