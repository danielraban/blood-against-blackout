"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Feed = {
  id: string;
  name: string;
  url: string;
  status: string;
  meetingCount: number;
  lastError: string | null;
  lastOkAt: string | null;
  fellowship?: string;
  format?: string;
};

export default function AdminFeedsPage() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");

  async function login() {
    const response = await fetch("/api/admin/feeds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", password }),
    });
    if (!response.ok) {
      setMessage("Wrong password");
      return;
    }
    setAuthed(true);
    await refresh();
  }

  async function refresh() {
    const response = await fetch("/api/admin/feeds");
    if (!response.ok) {
      setAuthed(false);
      return;
    }
    const data = await response.json();
    setFeeds(data.feeds ?? []);
  }

  async function post(body: Record<string, string>) {
    setMessage("Working…");
    const response = await fetch("/api/admin/feeds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    setMessage(JSON.stringify(data).slice(0, 400));
    await refresh();
  }

  if (!authed) {
    return (
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold lowercase">feeds</h1>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="admin password"
        />
        <Button onClick={() => void login()}>sign in</Button>
        {message ? <p className="text-sm text-muted">{message}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold lowercase">feeds</h1>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={() => void post({ action: "seed" })}>seed catalog</Button>
        <Button onClick={() => void post({ action: "ingest" })}>run ingest</Button>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="office name"
        />
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.org/wp-admin/admin-ajax.php?action=meetings"
        />
        <Button
          variant="outline"
          onClick={() => void post({ action: "add", url, name })}
        >
          add feed
        </Button>
      </div>
      {message ? (
        <pre className="overflow-auto rounded-xl border border-border p-3 text-xs">
          {message}
        </pre>
      ) : null}
      <ul className="space-y-2">
        {feeds.map((feed) => (
          <li key={feed.id} className="rounded-xl border border-border p-3 text-sm">
            <p className="font-medium">{feed.name}</p>
            <p className="break-all text-muted">{feed.url}</p>
            <p>
              {(feed.fellowship ?? "aa").toUpperCase()} · {feed.format ?? "tsml"} · {feed.status} · {feed.meetingCount} meetings
            </p>
            {feed.lastError ? <p className="text-danger">{feed.lastError}</p> : null}
            <Button
              variant="outline"
              className="mt-2"
              onClick={() =>
                void post({
                  action: "status",
                  id: feed.id,
                  status: feed.status === "disabled" ? "pending" : "disabled",
                })
              }
            >
              {feed.status === "disabled" ? "enable" : "disable"}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
