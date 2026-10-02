import { tool } from "ai";
import { z } from "zod";
import type { ChatMeetingRef } from "./chat-request";
import { searchAllowedMeetings } from "./chat-meetings";
import { loadAllowedMeetings, searchAllowedNotes } from "./chat-lookup";
import { parseMeetingFilters } from "./chat-ui";

const NO_AREA =
  "No area is loaded. Ask the user to use Nearby or pick a city.";

const meetingFiltersSchema = z.object({
  fellowship: z.enum(["all", "aa", "na", "ca"]).optional(),
  attendance: z.enum(["in-person", "online", "either"]).optional(),
  day: z
    .union([
      z.literal("today"),
      z.literal("any"),
      z.number().int().min(0).max(6),
    ])
    .optional(),
  timeWindow: z.enum(["any", "morning", "afternoon", "evening"]).optional(),
  openClosed: z.enum(["any", "O", "C"]).optional(),
  types: z.array(z.string()).optional(),
  query: z.string().max(80).optional(),
  week: z.boolean().optional(),
});

export function createChatTools(allowed: ChatMeetingRef[]) {
  return {
    searchMeetings: tool({
      description:
        "Find meetings in the user's already loaded area. Use this for time, day, fellowship, online/in-person, and named listings. Do not call it when no area is loaded.",
      inputSchema: meetingFiltersSchema,
      execute: async (input) => {
        if (allowed.length === 0) {
          return { meetings: [], notice: NO_AREA };
        }
        const filters = parseMeetingFilters(input);
        const meetings = searchAllowedMeetings(
          await loadAllowedMeetings(allowed),
          allowed,
          filters,
        );
        return {
          meetings,
          notice:
            meetings.length === 0
              ? "No matching meetings in this area."
              : undefined,
        };
      },
    }),
    searchNotes: tool({
      description:
        "Search published meeting notes and location notes in the user's already loaded area for door codes, access, beginners, formats, and similar free text.",
      inputSchema: z.object({
        query: z.string().min(2).max(160),
      }),
      execute: async ({ query }) => {
        if (allowed.length === 0) {
          return { notes: [], notice: NO_AREA };
        }
        const notes = await searchAllowedNotes(query, allowed);
        return {
          notes,
          notice:
            notes.length === 0
              ? "No matching notes in this area."
              : undefined,
        };
      },
    }),
  };
}
