import { describe, expect, it, vi } from "vitest";

import {
  enrichmentBatchSizeForJob,
  EnrichmentWorkflowCoordinator,
  mergeSuccessfulEnrichmentSteps,
  resumedEnrichmentStepStates,
  type EnrichmentWorkflowStep,
} from "../../frontend/src/features/enrichment/workflow";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("enrichment workflow", () => {
  it("uses smaller batches for slow external enrichment providers", () => {
    expect(enrichmentBatchSizeForJob({ useExternal: true }, 10)).toBe(2);
    expect(enrichmentBatchSizeForJob({ useExternal: false }, 10)).toBe(10);
  });

  it("restores the active stage and completed stages after a page refresh", () => {
    const steps = resumedEnrichmentStepStates(["benchmarks", "scores", "devices", "values"], "devices", [
      { id: "benchmarks", status: "success", result: { updated: 2 } },
      { id: "scores", status: "success" },
      { id: "devices", status: "running" },
      { id: "values", status: "pending" },
    ]);

    expect(steps.map((step) => step.status)).toEqual(["success", "success", "running", "pending"]);
    expect(steps[0]?.result).toEqual({ updated: 2 });
  });

  it("merges completed stages into a resumed partial workflow", () => {
    expect(
      mergeSuccessfulEnrichmentSteps(
        [
          { id: "benchmarks", status: "skipped" },
          { id: "devices", status: "running" },
        ],
        [
          { id: "benchmarks", status: "success", result: { updated: 3 } },
          { id: "devices", status: "running" },
        ],
      ),
    ).toEqual([
      { id: "benchmarks", status: "success", result: { updated: 3 } },
      { id: "devices", status: "running" },
    ]);
  });

  it("runs dependency steps in order and summarizes device results", async () => {
    const calls: string[] = [];
    const steps: EnrichmentWorkflowStep[] = [
      { id: "benchmarks", run: async () => (calls.push("benchmarks"), {}) },
      { id: "scores", run: async () => (calls.push("scores"), { updated: 4 }) },
      { id: "dates", run: async () => (calls.push("dates"), { updated: 3 }) },
      {
        id: "devices",
        run: async () => (calls.push("devices"), { analyzed: 12, updated: 8, skipped: 4, failures: 0 }),
      },
      { id: "values", run: async () => (calls.push("values"), { analyzed: 12, updated: 12 }) },
      { id: "refresh", run: async () => (calls.push("refresh"), {}) },
    ];

    const result = await new EnrichmentWorkflowCoordinator().run(steps);

    expect(calls).toEqual(["benchmarks", "scores", "dates", "devices", "values", "refresh"]);
    expect(result.summary).toEqual({ analyzed: 12, updated: 12, skipped: 4, failures: 0 });
    expect(result.failedStepIds).toEqual([]);
  });

  it("returns the same active promise and prevents a duplicate concurrent job", async () => {
    const gate = deferred<{ analyzed: number }>();
    const run = vi.fn(() => gate.promise);
    const coordinator = new EnrichmentWorkflowCoordinator();
    const steps = [{ id: "devices", run }];

    const first = coordinator.run(steps);
    const duplicate = coordinator.run(steps);
    expect(duplicate).toBe(first);
    expect(run).toHaveBeenCalledTimes(1);

    gate.resolve({ analyzed: 1 });
    await first;
  });

  it("continues after a partial failure and retries failed steps only", async () => {
    const calls: string[] = [];
    let failScores = true;
    const steps: EnrichmentWorkflowStep[] = [
      { id: "benchmarks", run: async () => (calls.push("benchmarks"), {}) },
      {
        id: "scores",
        run: async () => {
          calls.push("scores");
          if (failScores) throw new Error("score provider unavailable");
          return { updated: 5 };
        },
      },
      { id: "devices", run: async () => (calls.push("devices"), { analyzed: 8, updated: 7, skipped: 1 }) },
    ];
    const coordinator = new EnrichmentWorkflowCoordinator();

    const first = await coordinator.run(steps);
    expect(calls).toEqual(["benchmarks", "scores", "devices"]);
    expect(first.failedStepIds).toEqual(["scores"]);
    expect(first.summary.failures).toBe(1);

    failScores = false;
    calls.length = 0;
    const retried = await coordinator.retryFailed(first, steps);
    expect(calls).toEqual(["scores"]);
    expect(retried.failedStepIds).toEqual([]);
  });
});
