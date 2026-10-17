import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { Day } from "../src/types";
let date = "";
const password = "GardenTogether!26";
async function login(page: Page, letter?: string) {
  await page.goto("/");
  await page
    .getByLabel("Email", { exact: true })
    .fill(
      letter ? `grower.${letter}@fairdrop.local` : "coordinator@fairdrop.local",
    );
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "The daily water plan" }),
  ).toBeVisible();
  await expect(page.getByLabel("Day summary")).toBeVisible();
}
async function nav(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name, exact: true })
    .click();
}
async function publish(page: Page) {
  await page
    .getByRole("button", { name: "Generate plan", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Publish plan", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Publish plan", exact: true }).click();
  await expect(
    page.getByText("The community plan is published", { exact: true }),
  ).toBeVisible();
}
test.beforeEach(async ({ request }) => {
  const cfg = await request.get("/api/config");
  expect(cfg.ok()).toBeTruthy();
  date = (await cfg.json()).today;
  const res = await request.post("/api/login", {
    data: { email: "coordinator@fairdrop.local", password },
  });
  expect(res.ok()).toBeTruthy();
  const { csrf } = await res.json();
  const reset = await request.post("/api/demo/reset", {
    headers: { "X-CSRF-Token": csrf },
    data: { confirmation: "RESET FICTIONAL DEMO" },
  });
  expect(reset.ok()).toBeTruthy();
});

test("grower request → coordinator review → publication → own partial delivery → reload", async ({
  page,
  browser,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "a");
  await nav(page, "Requests");
  await page.getByRole("button", { name: "Edit request", exact: true }).click();
  await page.getByLabel("Requested water (L)").fill("60");
  await page
    .getByLabel("Note (optional)")
    .fill("Tomato beds need a morning-reviewed evening turn.");
  await page.getByRole("button", { name: "Save request", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".request-record .badge")).toHaveText("pending");
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  await login(page);
  await nav(page, "Requests");
  await page
    .getByRole("button", { name: "Review request", exact: true })
    .click();
  await page.getByLabel("Approved water (L)").fill("60");
  await page.getByLabel("Agreed minimum (L)").fill("12");
  await page
    .getByRole("button", { name: "Approve request", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await nav(page, "Plan");
  await publish(page);
  await page.getByRole("button", { name: "View Plot C allocation" }).click();
  await expect(page.locator(".plot-detail")).toContainText(
    "Your allocation is 32 L.",
  );
  await testInfo.attach("Desktop plan", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  const context = await browser.newContext();
  const grower = await context.newPage();
  await login(grower, "a");
  await nav(grower, "Delivery");
  await grower.getByRole("button", { name: "Start turn", exact: true }).click();
  await grower
    .getByRole("button", { name: "Record delivery", exact: true })
    .click();
  await grower.getByLabel("Actual volume delivered (L)").fill("30");
  await grower
    .getByLabel("Reason", { exact: true })
    .fill("Stopped after the bed was watered.");
  await grower
    .getByRole("button", { name: "Record delivery", exact: true })
    .last()
    .click();
  await expect(grower.getByRole("dialog")).toHaveCount(0);
  await grower.reload();
  await expect(grower.locator(".delivery-record").first()).toContainText(
    "30 L",
  );
  await expect(
    grower
      .locator(".delivery-record")
      .first()
      .getByText("Completed", { exact: true }),
  ).toBeVisible();
  await nav(page, "Delivery");
  await page.getByRole("button", { name: "Refresh day" }).click();
  await expect(page.locator(".delivery-record").first()).toContainText("30 L");
  await expect(page.locator(".delivery-balance")).toContainText("130 L");
  const auth = await (await grower.request.get("/api/me")).json();
  const d = await (await grower.request.get(`/api/days/${date}`)).json();
  const denied = await grower.request.post(`/api/days/${date}/publish`, {
    headers: { "X-CSRF-Token": auth.csrf },
    data: {
      revision: d.revision,
      operation_id: crypto.randomUUID(),
      draft_id: 1,
    },
  });
  expect(denied.status()).toBe(403);
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export CSV" }).click();
  const csv = await download;
  expect(csv.suggestedFilename()).toBe(`fairdrop-${date}.csv`);
  const csvPath = testInfo.outputPath("day.csv");
  await csv.saveAs(csvPath);
  await testInfo.attach("Exported day", {
    path: csvPath,
    contentType: "text/csv",
  });
  const csvText = await readFile(csvPath, "utf8");
  expect(csvText).toContain(
    "Date,Plot,Name,Requested L,Approved L,Allocated L",
  );
  expect(csvText).toContain("30,Completed,Stopped after the bed was watered.");
  expect(csvText).toContain("balance,130");
  await nav(page, "Activity");
  await expect(
    page
      .getByText("Stopped after the bed was watered.", { exact: false })
      .first(),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await context.close();
});

test("scenario conflict, alternative order, and blocked saved publication", async ({
  page,
}) => {
  await login(page);
  await page
    .getByRole("button", { name: "Generate plan", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Publish plan" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Explore scenarios" }).click();
  await page.getByRole("button", { name: "B: later availability" }).click();
  await expect(page.locator(".scenario-label")).toContainText(
    "feasible schedule",
  );
  await expect(page.locator(".turn-list li button")).toHaveText([
    "Plot A",
    "Plot C",
    "Plot D",
    "Plot B",
    "Plot E",
    "Plot F",
  ]);
  await expect(page.locator(".turn-list li").last()).toContainText("17:33");
  await page.getByRole("button", { name: "F: only 10 minutes" }).click();
  await expect(page.getByRole("alert")).toContainText("needs 20 minutes");
  await expect(page.getByRole("alert")).toContainText("10 minutes");
  await expect(
    page.getByRole("button", { name: "Publish plan" }),
  ).toBeDisabled();
  await expect(page.locator(".ledger-row").last()).toContainText("40 L");
  await page.getByRole("button", { name: "Return to saved plan" }).click();
  await nav(page, "Requests");
  await page
    .locator(".request-record")
    .last()
    .getByRole("button", { name: "Edit request" })
    .click();
  await page.getByLabel("Available until").fill("17:10");
  await page.getByRole("button", { name: "Save request", exact: true }).click();
  await page
    .getByRole("button", { name: "Review request", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Approve request", exact: true })
    .click();
  await nav(page, "Plan");
  await page
    .getByRole("button", { name: "Generate plan", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Publish plan" }),
  ).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText(
    "Calculated allocations are unscheduled",
  );
});

test("overdelivery reconciliation preserves failed form, top-up and correction", async ({
  page,
}) => {
  await login(page);
  await publish(page);
  await nav(page, "Delivery");
  await page
    .getByRole("button", { name: "Start turn", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Record delivery", exact: true })
    .click();
  await page.getByLabel("Actual volume delivered (L)").fill("170");
  await page.getByLabel("Reason", { exact: true }).fill("Measured total");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Record delivery", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "exceeds the accounted source balance",
  );
  await expect(page.getByLabel("Actual volume delivered (L)")).toHaveValue(
    "170",
  );
  await page.getByLabel("Actual volume delivered (L)").fill("50");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Record delivery", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("alert")).toContainText("10 L shortfall");
  await expect(page.locator(".delivery-balance")).toContainText("110 L");
  await page.getByRole("button", { name: "Record source adjustment" }).click();
  await page.getByLabel("Adjustment (L)", { exact: true }).fill("10");
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Measured 10 L top-up from the rain barrel.");
  await page
    .getByRole("button", { name: "Record adjustment", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".delivery-balance")).toContainText("120 L");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Correct delivery" }).click();
  await page.getByLabel("Actual volume delivered (L)").fill("45");
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Corrected jug reading");
  await page.getByRole("button", { name: "Save correction" }).click();
  await expect(page.locator(".delivery-balance")).toContainText("125 L");
  await nav(page, "Activity");
  await expect(
    page.getByText("Corrected delivery", { exact: true }),
  ).toBeVisible();
});

test("mobile fieldbook, long names, keyboard focus, and empty day", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await nav(page, "Requests");
  await page
    .locator(".request-record")
    .first()
    .getByRole("button", { name: "Edit plot", exact: true })
    .click();
  await page
    .getByLabel("Plot name", { exact: true })
    .fill(
      "Plot A · The neighbourhood demonstration tomato and basil growing bed",
    );
  await page.getByRole("button", { name: "Save plot", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await nav(page, "Plan");
  await page
    .getByRole("button", { name: "Generate plan", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Publish plan" }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await expect(page.locator(".timeline-desktop")).toBeHidden();
  await expect(page.locator(".turn-list li")).toHaveCount(6);
  await page
    .getByRole("button", { name: "Garden schematic", exact: true })
    .click();
  await expect(page.locator(".garden-svg")).toBeVisible();
  await page.locator(".garden-bed").nth(2).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".plot-detail")).toContainText(
    "Your allocation is 32 L.",
  );
  expect(
    await page
      .locator(".garden-bed")
      .nth(2)
      .evaluate((el) => el === document.activeElement),
  ).toBeTruthy();
  await testInfo.attach("Mobile plan", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  const emptyDate = new Date(`${date}T12:00:00Z`);
  emptyDate.setUTCDate(emptyDate.getUTCDate() + 1);
  await page
    .getByLabel("Watering date", { exact: true })
    .fill(emptyDate.toISOString().slice(0, 10));
  await expect(
    page.getByRole("heading", { name: "No watering day on this date" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open watering day" }).click();
  await expect(
    page.getByText("No requests yet. Open Requests to add the first plot."),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});

test("network error keeps edited request and can be retried", async ({
  page,
}) => {
  await login(page, "a");
  await nav(page, "Requests");
  await page.getByRole("button", { name: "Edit request" }).click();
  await page.getByLabel("Requested water (L)").fill("55.125");
  await page.route(`**/api/days/${date}/requests/A`, (route) =>
    route.abort("failed"),
  );
  await page.getByRole("button", { name: "Save request", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Cannot reach FairDrop");
  await expect(page.getByLabel("Requested water (L)")).toHaveValue("55.125");
  await page.unroute(`**/api/days/${date}/requests/A`);
  await page.getByRole("button", { name: "Save request", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".request-record")).toContainText("55.125 L");
});

test("built frontend deep links, API errors and print stylesheet", async ({
  page,
  request,
}, testInfo) => {
  expect((await request.get("/api/does-not-exist")).status()).toBe(404);
  expect((await request.get("/requests")).status()).toBe(200);
  await login(page);
  await publish(page);
  await page.getByRole("button", { name: "Print day", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/print\\?date=${date}$`));
  await expect(
    page.getByRole("heading", { name: "Plan & delivery ledger" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".print-only table tbody tr")).toHaveCount(6);
  await expect(page.locator(".print-toolbar")).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".print-only")).toBeVisible();
  await expect(page.locator(".print-toolbar")).toBeHidden();
  await expect(page.locator(".print-only table tbody tr")).toHaveCount(6);
  const pdf = await page.pdf({
    path: testInfo.outputPath("day.pdf"),
    format: "A4",
    landscape: true,
  });
  await testInfo.attach("Printed day", {
    body: pdf,
    contentType: "application/pdf",
  });
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdf.length).toBeGreaterThan(1000);
  await page.emulateMedia({ media: "screen" });
});

test("all turns resolve, reduced target and missed turn reconcile, and the day closes", async ({
  page,
}) => {
  await login(page);
  await publish(page);
  const published: Day = await (
    await page.request.get(`/api/days/${date}`)
  ).json();
  expect(published.plan?.snapshot.rows.map((row) => row.allocated_ml)).toEqual([
    40000, 16000, 32000, 8000, 24000, 40000,
  ]);
  await nav(page, "Delivery");
  const turns = page.locator(".delivery-record");
  await expect(
    page.getByRole("button", { name: "Close watering day" }),
  ).toHaveCount(0);
  await expect(
    turns.nth(1).getByRole("button", { name: "Start turn" }),
  ).toBeDisabled();

  await turns
    .nth(1)
    .getByRole("button", { name: "Mark missed", exact: true })
    .click();
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Grower could not attend today's watering.");
  await page
    .getByRole("button", { name: "Mark turn missed", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(turns.nth(1).getByText("Missed", { exact: true })).toBeVisible();
  await expect(turns.nth(1).locator(".delivery-values dd").nth(2)).toHaveText(
    "0 L",
  );

  await turns
    .nth(2)
    .getByRole("button", { name: "Adjust execution target" })
    .click();
  await page.getByLabel("Execution target (L)").fill("20");
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Grower agreed to a smaller watering today.");
  await page.getByRole("button", { name: "Authorize smaller target" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(turns.nth(2)).toContainText("32 L");
  await expect(turns.nth(2)).toContainText("20 L");

  for (const [index, actual] of [
    [0, 40],
    [2, 20],
    [3, 8],
    [4, 24],
    [5, 40],
  ]) {
    const turn = turns.nth(index);
    await turn.getByRole("button", { name: "Start turn", exact: true }).click();
    await expect(turn.getByText("In progress", { exact: true })).toBeVisible();
    // There must never be a second startable turn while the hose is in use.
    for (const button of await page
      .getByRole("button", { name: "Start turn", exact: true })
      .all()) {
      await expect(button).toBeDisabled();
    }
    await turn
      .getByRole("button", { name: "Record delivery", exact: true })
      .click();
    await expect(page.getByLabel("Actual volume delivered (L)")).toHaveValue(
      String(actual),
    );
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Record delivery", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(turn.getByText("Completed", { exact: true })).toBeVisible();
  }

  await expect(
    page.getByRole("heading", { name: "All turns resolved" }),
  ).toBeVisible();
  await expect(page.locator(".delivery-balance")).toContainText("132 L");
  await expect(page.locator(".delivery-balance")).toContainText("28 L");
  await expect(page.locator(".delivery-footnote")).toContainText(
    "28 L shortfall on finalized turns",
  );
  await page.getByRole("button", { name: "Close watering day" }).click();
  await expect(page.locator(".section-heading .badge")).toHaveText("Closed");
  await page.reload();
  await expect(page.locator(".section-heading .badge")).toHaveText("Closed");
  await expect(page.getByRole("button", { name: "Start turn" })).toHaveCount(0);
  const closed: Day = await (
    await page.request.get(`/api/days/${date}`)
  ).json();
  expect(closed.state).toBe("Closed");
  expect(closed.accounting).toMatchObject({
    delivered_ml: 132000,
    balance_ml: 28000,
    remaining_plan_ml: 0,
    remaining_shortfall_ml: 0,
    finalized_shortfall_ml: 28000,
  });
  expect(closed.plan?.snapshot).toEqual(published.plan?.snapshot);
  expect(closed.turns.map((turn) => turn.state)).toEqual([
    "Completed",
    "Missed",
    "Completed",
    "Completed",
    "Completed",
    "Completed",
  ]);
  await nav(page, "Requests");
  for (const button of await page
    .getByRole("button", { name: "Edit request", exact: true })
    .all()) {
    await expect(button).toBeDisabled();
  }
  await nav(page, "Activity");
  await expect(page.getByText("Closed day", { exact: true })).toBeVisible();
  await nav(page, "Plan");
  await expect(
    page.getByText("This watering day is complete", { exact: true }),
  ).toBeVisible();
});

test("concurrent edits reject stale revisions and preserve the unsaved request", async ({
  page,
  context,
}) => {
  await login(page);
  await nav(page, "Requests");
  await page
    .locator(".request-record")
    .first()
    .getByRole("button", { name: "Edit request" })
    .click();
  await page.getByLabel("Requested water (L)").fill("55");
  const second = await context.newPage();
  await second.goto(`/requests?date=${date}`);
  await second
    .locator(".request-record")
    .nth(1)
    .getByRole("button", { name: "Edit request" })
    .click();
  await second
    .getByLabel("Note (optional)")
    .fill("A concurrent update from the other coordinator tab.");
  await second
    .getByRole("button", { name: "Save request", exact: true })
    .click();
  await expect(second.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Save request", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "This day changed",
  );
  await expect(page.getByLabel("Requested water (L)")).toHaveValue("55");
  const unchanged: Day = await (
    await page.request.get(`/api/days/${date}`)
  ).json();
  expect(
    unchanged.requests.find((request) => request.plot_id === "A")?.requested_ml,
  ).toBe(60000);
  expect(
    unchanged.requests.find((request) => request.plot_id === "B")?.note,
  ).toContain("concurrent update");
  await page.getByRole("button", { name: "Close dialog" }).click();
  const refreshed = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/days/${date}`) &&
      response.request().method() === "GET",
  );
  await page.getByRole("button", { name: "Refresh day" }).click();
  await refreshed;
  await expect(page.locator(".request-record").nth(1)).toContainText(
    "concurrent update",
  );
  await page
    .locator(".request-record")
    .first()
    .getByRole("button", { name: "Edit request" })
    .click();
  await page.getByLabel("Requested water (L)").fill("55");
  await page.getByRole("button", { name: "Save request", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".request-record").first()).toContainText("55 L");
  await expect(
    page.locator(".request-record").first().locator(".badge"),
  ).toHaveText("pending");
  await second.close();
});
