import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import type { Meeting, SlicePayload } from "../src/lib/types";

const city = {
  slug: "london-england",
  label: "London",
  parentLabel: "England",
  state: null,
  country: "GB",
  lat: 51.5072,
  lng: -0.1276,
  geohash4: "gcpv",
  meetingCount: 1,
};

function emptySlice(geohash = "gcpv"): SlicePayload {
  return {
    geohash,
    neighbors: [],
    fetchedAt: new Date().toISOString(),
    meetings: [],
    sourceFeeds: [],
  };
}

function meeting(): Meeting {
  const starts = new Date(Date.now() + 30 * 60 * 1000);
  return {
    feedId: "qa-feed",
    slug: "qa-online-meeting",
    name: "QA Online Meeting",
    groupName: null,
    day: starts.getDay(),
    time: `${String(starts.getHours()).padStart(2, "0")}:${String(starts.getMinutes()).padStart(2, "0")}`,
    endTime: null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    types: ["O"],
    attendance: "online",
    fellowship: "aa",
    locationName: null,
    address: null,
    city: null,
    neighborhood: null,
    state: null,
    postalCode: null,
    country: null,
    formattedAddress: null,
    lat: null,
    lng: null,
    geohash4: null,
    conferenceUrl: "https://zoom.us/j/123456789",
    conferencePhone: null,
    notes: null,
    locationNotes: null,
    updatedAt: new Date().toISOString(),
    sourceVerifiedAt: new Date().toISOString(),
    entityId: null,
    entityName: null,
    entityPhone: null,
    entityEmail: null,
    entityUrl: null,
    feedbackEmails: [],
  };
}

async function mockAppApis(
  page: Page,
  {
    cities = [city],
    meetings = [] as Meeting[],
    slice = emptySlice(),
  } = {},
) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/cities") {
      return route.fulfill({ json: { cities } });
    }
    if (url.pathname === "/api/online") {
      return route.fulfill({ json: { meetings } });
    }
    if (url.pathname.startsWith("/api/slices/")) {
      return route.fulfill({ json: { ...slice, geohash: url.pathname.split("/").at(-1) } });
    }
    return route.fulfill({ status: 404, json: { error: "unmocked" } });
  });
}

async function expectNoSeriousAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = results.violations
    .filter(({ impact }) => impact === "serious" || impact === "critical")
    .map(({ id, impact, nodes }) => ({
      id,
      impact,
      targets: nodes.map((node) => node.target),
    }));

  expect(blocking).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("oc-install-dismissed", "1");
  });
});

test("offers a city fallback when geolocation is denied", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (
          _success: PositionCallback,
          error?: PositionErrorCallback,
        ) =>
          error?.({
            code: 1,
            message: "denied",
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          } as GeolocationPositionError),
      },
    });
  });
  await mockAppApis(page);

  await page.goto("/");
  await page.getByRole("button", { name: "use my location" }).click();
  await expect(page.getByText("Location was denied. Search a city instead.")).toBeVisible();

  await page.getByRole("combobox", { name: "Search city" }).fill("London");
  await page.getByRole("option", { name: /London/ }).click();
  await expect(page.getByText("No public feed covers London yet.")).toBeVisible();
});

test("loads the online meeting API without a live database", async ({ page }) => {
  await mockAppApis(page, { meetings: [meeting()] });

  await page.goto("/online");
  await expect(page.getByRole("heading", { name: "online meetings" })).toBeVisible();
  await expect(page.getByText("QA Online Meeting")).toBeVisible();
});

test("restores saved places from IndexedDB", async ({ page }) => {
  await mockAppApis(page);
  await page.goto("/saved");
  await expect(page.getByText("Favorites stay on this device only.")).toBeVisible();

  await page.evaluate(async (savedCity) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("openchair", 1);
      request.onupgradeneeded = () => {
        const next = request.result;
        if (!next.objectStoreNames.contains("places")) {
          next.createObjectStore("places");
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("places", "readwrite");
      transaction.objectStore("places").put(
        {
          kind: "home",
          label: savedCity.label,
          geohash4: savedCity.geohash4,
          lat: savedCity.lat,
          lng: savedCity.lng,
          citySlug: savedCity.slug,
        },
        "home",
      );
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  }, city);

  await page.reload();
  await expect(page.getByRole("link", { name: /home London/ })).toBeVisible();
});

for (const path of ["/", "/online", "/saved"]) {
  test(`${path} has no serious automated accessibility violations`, async ({ page }) => {
    await mockAppApis(page);
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    await expectNoSeriousAccessibilityViolations(page);
  });
}
