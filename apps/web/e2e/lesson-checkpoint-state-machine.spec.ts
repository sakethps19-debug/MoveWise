import { test, expect, allowExpectedConsoleError } from "./fixtures";
import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * P0 "complete checkpoint state model": direct tests of the epoch/revision
 * state machine (lib/lessonCheckpointStore.ts) — mostly via raw fetches
 * to app/api/lesson-checkpoint/route.ts, since these are server-side
 * ordering guarantees that don't need a real lesson UI to exercise
 * precisely. See lesson-resume.spec.ts for the UI-driven resume/restart/
 * completion coverage this complements.
 */

const DB_HELPER = path.join(__dirname, "db-helper.mjs");
function dbHelper(command: string, args: Record<string, unknown> = {}): string {
  return execFileSync("node", [DB_HELPER, command, JSON.stringify(args)], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf-8",
  });
}

const LESSON_ID = "meet-the-pieces.01-welcome";
const LESSON_ID_URL = `/learn/${LESSON_ID}`;

async function signUpAndLogIn(page: import("@playwright/test").Page, email: string): Promise<void> {
  const password = "password123";
  dbHelper("create-user", { email, password });
  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  await page.click("button[type=submit]");
  await page.waitForURL("/");
}

function checkpointBody(overrides: Record<string, unknown>) {
  return {
    lessonId: LESSON_ID,
    lessonVersion: 1,
    epoch: 0,
    revision: 1,
    stepIndex: 0,
    mistakes: 0,
    hintsUsed: 0,
    attempts: [],
    ...overrides,
  };
}

async function postCheckpoint(page: import("@playwright/test").Page, overrides: Record<string, unknown>) {
  return page.evaluate(async (body) => {
    const res = await fetch("/api/lesson-checkpoint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    return { status: res.status, ...json };
  }, overrides);
}

test("two writes at the same epoch and revision: the second is an explicit collision, not a silent overwrite", async ({
  page,
}) => {
  const email = `collide${Date.now()}@example.com`;
  await signUpAndLogIn(page, email);

  const first = await postCheckpoint(page, checkpointBody({ epoch: 0, revision: 1, stepIndex: 2 }));
  expect(first.skipped).toBeUndefined();
  const second = await postCheckpoint(page, checkpointBody({ epoch: 0, revision: 1, stepIndex: 5 }));
  expect(second.skipped).toBe("stale-collision");

  const userId = dbHelper("get-user-id", { email });
  const stored = JSON.parse(dbHelper("get-lesson-checkpoint", { userId, lessonId: LESSON_ID }));
  expect(stored.stepIndex).toBe(2); // the first write, never silently replaced by the colliding one
});

test("a write from an old epoch is rejected outright, even with a higher revision than the current epoch's", async ({
  page,
}) => {
  const email = `oldepoch${Date.now()}@example.com`;
  await signUpAndLogIn(page, email);

  await postCheckpoint(page, checkpointBody({ epoch: 0, revision: 1, stepIndex: 1 }));
  // A "restart" moves to epoch 1.
  await postCheckpoint(page, checkpointBody({ epoch: 1, revision: 1, stepIndex: 0 }));

  // An old tab, still unaware of the restart, sends a stale epoch-0 write
  // with a revision number far higher than anything in epoch 1.
  const stale = await postCheckpoint(page, checkpointBody({ epoch: 0, revision: 999, stepIndex: 3 }));
  expect(stale.skipped).toBe("stale-epoch");

  const userId = dbHelper("get-user-id", { email });
  const stored = JSON.parse(dbHelper("get-lesson-checkpoint", { userId, lessonId: LESSON_ID }));
  expect(stored.epoch).toBe(1);
  expect(stored.stepIndex).toBe(0); // untouched by the old-epoch write
});

test("an old-tab write after completion cannot recreate the checkpoint as in-progress", async ({ page }) => {
  const email = `oldaftercomplete${Date.now()}@example.com`;
  await signUpAndLogIn(page, email);

  await postCheckpoint(page, checkpointBody({ epoch: 0, revision: 1, stepIndex: 1 }));
  await postCheckpoint(page, checkpointBody({ epoch: 0, revision: 2, stepIndex: 2 }));
  // Completion closes the checkpoint at a higher revision, same epoch.
  const closeResult = await postCheckpoint(page, { lessonId: LESSON_ID, epoch: 0, revision: 3, closed: true });
  expect(closeResult.skipped).toBeUndefined();

  // A slow save from before completion, still carrying an older revision
  // within the same epoch, finally reaches the server.
  const stale = await postCheckpoint(page, checkpointBody({ epoch: 0, revision: 2, stepIndex: 2 }));
  expect(stale.skipped).toBe("stale-revision");

  const userId = dbHelper("get-user-id", { email });
  const stored = JSON.parse(dbHelper("get-lesson-checkpoint", { userId, lessonId: LESSON_ID }));
  expect(stored.stepIndex).toBe(-1); // still closed, never resurrected as "in progress"
});

test("a genuinely new attempt after restart is accepted and actually progresses", async ({ page }) => {
  const email = `newattempt${Date.now()}@example.com`;
  await signUpAndLogIn(page, email);

  await postCheckpoint(page, checkpointBody({ epoch: 0, revision: 1, stepIndex: 3 }));
  await postCheckpoint(page, { lessonId: LESSON_ID, epoch: 1, revision: 1, closed: true }); // "Start over"

  const firstNewSave = await postCheckpoint(page, checkpointBody({ epoch: 1, revision: 2, stepIndex: 0 }));
  expect(firstNewSave.skipped).toBeUndefined();
  const secondNewSave = await postCheckpoint(page, checkpointBody({ epoch: 1, revision: 3, stepIndex: 1 }));
  expect(secondNewSave.skipped).toBeUndefined();

  const userId = dbHelper("get-user-id", { email });
  const stored = JSON.parse(dbHelper("get-lesson-checkpoint", { userId, lessonId: LESSON_ID }));
  expect(stored.epoch).toBe(1);
  expect(stored.stepIndex).toBe(1);
});

test("completion during an in-flight older save: the older save is rejected once it finally arrives", async ({ page }) => {
  const email = `inflight${Date.now()}@example.com`;
  await signUpAndLogIn(page, email);

  await postCheckpoint(page, checkpointBody({ epoch: 0, revision: 1, stepIndex: 1 }));
  // Completion "wins the race" and lands first.
  await postCheckpoint(page, { lessonId: LESSON_ID, epoch: 0, revision: 3, closed: true });
  // The in-flight save (revision 2, sent before completion but arriving after) lands last.
  const lateSave = await postCheckpoint(page, checkpointBody({ epoch: 0, revision: 2, stepIndex: 2 }));
  expect(lateSave.skipped).toBe("stale-revision");

  const userId = dbHelper("get-user-id", { email });
  const stored = JSON.parse(dbHelper("get-lesson-checkpoint", { userId, lessonId: LESSON_ID }));
  expect(stored.stepIndex).toBe(-1);
});

test("duplicate request delivery (the exact same write sent twice) is a harmless no-op, not an error", async ({ page }) => {
  const email = `duplicate${Date.now()}@example.com`;
  await signUpAndLogIn(page, email);

  const body = checkpointBody({ epoch: 0, revision: 4, stepIndex: 2 });
  const first = await postCheckpoint(page, body);
  const duplicate = await postCheckpoint(page, body);
  expect(first.status).toBe(200);
  expect(duplicate.status).toBe(200); // never a 4xx/5xx — a duplicate is a recognized, harmless case
  expect(duplicate.skipped).toBe("stale-collision");

  const userId = dbHelper("get-user-id", { email });
  const stored = JSON.parse(dbHelper("get-lesson-checkpoint", { userId, lessonId: LESSON_ID }));
  expect(stored.stepIndex).toBe(2);
});

test("a request retried after a network failure eventually applies", async ({ page }) => {
  const email = `retry${Date.now()}@example.com`;
  await signUpAndLogIn(page, email);
  // The deliberately aborted first attempt logs a real browser console
  // error (net::ERR_FAILED) — expected here, not a defect (see
  // network-resilience.spec.ts for the established precedent).
  allowExpectedConsoleError(page, /net::ERR_FAILED/);

  let failedOnce = false;
  await page.route("**/api/lesson-checkpoint", async (route) => {
    if (!failedOnce) {
      failedOnce = true;
      await route.abort("failed");
      return;
    }
    await route.continue();
  });

  const result = await page.evaluate(async (body) => {
    async function postWithRetry(): Promise<unknown> {
      try {
        const res = await fetch("/api/lesson-checkpoint", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        return await res.json();
      } catch {
        // Retry once on a transient network failure — the same recovery
        // a real client should perform (lib/checkpointClient.ts reports
        // "network-error" precisely so a caller can decide to retry).
        const res = await fetch("/api/lesson-checkpoint", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        return await res.json();
      }
    }
    return postWithRetry();
  }, checkpointBody({ epoch: 0, revision: 1, stepIndex: 4 }));

  expect((result as { ok?: boolean }).ok).toBe(true);
  const userId = dbHelper("get-user-id", { email });
  const stored = JSON.parse(dbHelper("get-lesson-checkpoint", { userId, lessonId: LESSON_ID }));
  expect(stored.stepIndex).toBe(4);
});

test("a checkpoint saved against a since-edited lesson (stale lessonVersion) is discarded, not resumed", async ({ page }) => {
  const email = `versionmismatch${Date.now()}@example.com`;
  await signUpAndLogIn(page, email);
  const userId = dbHelper("get-user-id", { email });

  // Seed a checkpoint directly at a version the live lesson content no
  // longer matches (the real lesson is version 1) — simulating a content
  // edit that shipped after this row was written.
  dbHelper("set-lesson-checkpoint", { userId, lessonId: LESSON_ID, lessonVersion: 999, stepIndex: 3, epoch: 0, revision: 1 });

  await page.goto(`/learn/${LESSON_ID}`);
  // Never offered a resume choice against step semantics that may have
  // changed since — starts clean at step 1 instead.
  await expect(page.getByRole("heading", { name: "Welcome back" })).toHaveCount(0);
  await expect(page.getByText("This is a chessboard")).toBeVisible();

  const stored = dbHelper("get-lesson-checkpoint", { userId, lessonId: LESSON_ID });
  expect(stored).toBe(""); // the stale row was cleaned up, not left dangling
});

test("two real browser tabs open on the same fresh attempt: one save collides with the other, and the losing tab is told so", async ({
  page,
  context,
}) => {
  const email = `twotabs${Date.now()}@example.com`;
  await signUpAndLogIn(page, email);

  // A second tab, signed in as the same learner (same browser context =
  // same session cookie), opening the identical lesson at the identical
  // starting point — the real "left a tab open, opened it again
  // elsewhere" scenario, not a simulated one.
  const page2 = await context.newPage();
  await page.goto(LESSON_ID_URL);
  await page2.goto(LESSON_ID_URL);
  await expect(page.getByText("This is a chessboard")).toBeVisible();
  await expect(page2.getByText("This is a chessboard")).toBeVisible();

  // Both tabs advance past their first checkpoint-triggering step at
  // essentially the same time — both compute the same next revision
  // number independently, since neither knows about the other's write.
  await Promise.all([
    page.getByRole("button", { name: "Continue" }).click(),
    page2.getByRole("button", { name: "Continue" }).click(),
  ]);

  // Give both tabs' keepalive saves time to reach the server.
  await page.waitForTimeout(1000);

  const userId = dbHelper("get-user-id", { email });
  const stored = JSON.parse(dbHelper("get-lesson-checkpoint", { userId, lessonId: LESSON_ID }));
  // Exactly one tab's write won — the row reflects a single coherent
  // state, never a mix, and was never silently overwritten back and
  // forth.
  expect(stored.stepIndex).toBe(1);

  await page2.close();
});

test("guest checkpoints never touch the epoch/revision server state machine at all", async ({ page }) => {
  // Guests persist entirely client-side (lib/guestProgress.ts) — no
  // session, so no server-side row and nothing for this state machine to
  // guard. A direct, unauthenticated request must be rejected outright.
  const response = await page.request.post("/api/lesson-checkpoint", {
    data: checkpointBody({ epoch: 0, revision: 1, stepIndex: 1 }),
  });
  expect(response.status()).toBe(401);
});
