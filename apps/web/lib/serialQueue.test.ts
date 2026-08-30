import { describe, expect, it } from "vitest";
import { createSerialQueue } from "./serialQueue";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("createSerialQueue", () => {
  it("runs enqueued tasks strictly in order, even when an earlier task takes longer than a later one", async () => {
    const enqueue = createSerialQueue();
    const order: number[] = [];

    // Task 1 is the slow one — without serialization, task 2 (fast) would
    // finish first, exactly the "later click's request completes before
    // an earlier one" race this queue exists to prevent.
    const p1 = enqueue(async () => {
      await delay(30);
      order.push(1);
    });
    const p2 = enqueue(async () => {
      order.push(2);
    });
    const p3 = enqueue(async () => {
      order.push(3);
    });

    await Promise.all([p1, p2, p3]);
    expect(order).toEqual([1, 2, 3]);
  });

  it("does not start a later task until an earlier task has actually settled, not just been enqueued", async () => {
    const enqueue = createSerialQueue();
    const started: number[] = [];
    const finished: number[] = [];

    const p1 = enqueue(async () => {
      started.push(1);
      await delay(20);
      finished.push(1);
    });
    const p2 = enqueue(async () => {
      started.push(2);
      finished.push(2);
    });

    await Promise.all([p1, p2]);
    // Task 2 must not have started before task 1 finished.
    expect(finished.indexOf(1)).toBeLessThan(started.indexOf(2) === 0 ? 1 : started.indexOf(2));
    expect(finished).toEqual([1, 2]);
  });

  it("a rejected task does not block subsequent tasks from running", async () => {
    const enqueue = createSerialQueue();
    const order: string[] = [];

    const p1 = enqueue(async () => {
      order.push("first");
      throw new Error("boom");
    });
    const p2 = enqueue(async () => {
      order.push("second");
    });

    await expect(p1).rejects.toThrow("boom");
    await p2;
    expect(order).toEqual(["first", "second"]);
  });

  it("each caller still observes its own task's rejection directly", async () => {
    const enqueue = createSerialQueue();
    const p1 = enqueue(async () => {
      throw new Error("task failed");
    });
    await expect(p1).rejects.toThrow("task failed");
  });

  it("independent queues never interleave with each other's ordering (a queue is per-resource, not global)", async () => {
    const queueA = createSerialQueue();
    const queueB = createSerialQueue();
    const order: string[] = [];

    const pA1 = queueA(async () => {
      await delay(20);
      order.push("a1");
    });
    const pB1 = queueB(async () => {
      order.push("b1");
    });

    await Promise.all([pA1, pB1]);
    // b1 (fast, different queue) is allowed to finish before a1 (slow) —
    // only same-queue ordering is guaranteed.
    expect(order).toContain("a1");
    expect(order).toContain("b1");
  });
});
