import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { feeds, ingestRuns } from "@/lib/schema";
import {
  adminCookieHeader,
  checkAdminPassword,
  clearAdminCookieHeader,
  isAdmin,
} from "@/lib/admin";
import { ingestAllFeeds, ingestOneFeed, seedFeedCatalog } from "@/lib/ingest";
import { slugify } from "@/lib/utils";
import { assertPublicHttpsUrl } from "@/lib/url-security";
import { runMeetingAudit } from "@/lib/audit";

type AdminBody = {
  action: "login" | "logout" | "seed" | "ingest" | "add" | "status";
  password?: string;
  url?: string;
  name?: string;
  id?: string;
  status?: "disabled" | "pending";
  fellowship?: "aa" | "na" | "ca";
  format?: "tsml" | "bmlt" | "oiaa";
};

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getDb();
  const [feedRows, runs, audit] = await Promise.all([
    db.select().from(feeds),
    db.select().from(ingestRuns).orderBy(desc(ingestRuns.id)).limit(10),
    runMeetingAudit(),
  ]);
  return NextResponse.json({
    feeds: feedRows,
    runs,
    audit,
  });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  let body: AdminBody;
  try {
    body = await parseBody(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (body.action === "login") {
    if (!checkAdminPassword(body.password ?? "")) {
      return NextResponse.json({ error: "Wrong password" }, { status: 401 });
    }
    try {
      return NextResponse.json(
        { ok: true },
        { headers: { "Set-Cookie": adminCookieHeader() } },
      );
    } catch {
      return NextResponse.json(
        { error: "Admin session is not configured" },
        { status: 503 },
      );
    }
  }

  if (body.action === "logout") {
    return NextResponse.json(
      { ok: true },
      { headers: { "Set-Cookie": clearAdminCookieHeader() } },
    );
  }

  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (body.action === "seed") {
    await seedFeedCatalog({ force: true });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "ingest") {
    const result = await ingestAllFeeds();
    return NextResponse.json(result);
  }

  if (body.action === "add" && body.url) {
    try {
      await assertPublicHttpsUrl(body.url);
      const result = await ingestOneFeed(
        body.url,
        body.name || body.url,
        body.id || slugify(body.name || body.url),
        body.fellowship,
        body.format,
      );
      return NextResponse.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Feed could not be added";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  if (body.action === "status" && body.id && body.status) {
    const db = getDb();
    await db
      .update(feeds)
      .set({ status: body.status })
      .where(eq(feeds.id, body.id));
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

async function parseBody(request: Request): Promise<AdminBody> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 16_384) throw new Error("Request is too large");
  if (!request.headers.get("content-type")?.includes("application/json")) {
    throw new Error("Content-Type must be application/json");
  }

  const value = (await request.json()) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Request body must be an object");
  }
  const record = value as Record<string, unknown>;
  const actions = ["login", "logout", "seed", "ingest", "add", "status"] as const;
  if (!actions.includes(record.action as (typeof actions)[number])) {
    throw new Error("Unknown action");
  }

  const body: AdminBody = { action: record.action as AdminBody["action"] };
  for (const key of ["password", "url", "name", "id"] as const) {
    const item = record[key];
    if (item != null && typeof item !== "string") {
      throw new Error(`${key} must be a string`);
    }
    if (typeof item === "string") body[key] = item.trim().slice(0, 2048);
  }
  if (body.name && body.name.length > 160) throw new Error("name is too long");
  if (body.id && !/^[a-z0-9-]{1,80}$/.test(body.id)) {
    throw new Error("id must contain lowercase letters, numbers, or hyphens");
  }

  if (record.status === "disabled" || record.status === "pending") {
    body.status = record.status;
  } else if (record.status != null) {
    throw new Error("Invalid status");
  }
  if (record.fellowship === "aa" || record.fellowship === "na" || record.fellowship === "ca") {
    body.fellowship = record.fellowship;
  } else if (record.fellowship != null) {
    throw new Error("Invalid fellowship");
  }
  if (record.format === "tsml" || record.format === "bmlt" || record.format === "oiaa") {
    body.format = record.format;
  } else if (record.format != null) {
    throw new Error("Invalid feed format");
  }

  if (body.action === "login" && !body.password) throw new Error("Password is required");
  if (body.action === "add" && !body.url) throw new Error("Feed URL is required");
  if (body.action === "status" && (!body.id || !body.status)) {
    throw new Error("Feed id and status are required");
  }
  return body;
}

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return origin === new URL(request.url).origin;
}
