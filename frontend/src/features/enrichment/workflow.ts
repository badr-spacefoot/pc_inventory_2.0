export type EnrichmentStepStatus = "pending" | "running" | "success" | "failed" | "skipped";

export interface EnrichmentStepResult {
  analyzed?: number;
  updated?: number;
  skipped?: number;
  failures?: number;
  [key: string]: unknown;
}

export interface EnrichmentWorkflowStep {
  id: string;
  run: () => Promise<EnrichmentStepResult>;
}

export interface EnrichmentStepState {
  id: string;
  status: EnrichmentStepStatus;
  result?: EnrichmentStepResult;
  error?: string;
}

export interface EnrichmentWorkflowSummary {
  analyzed: number;
  updated: number;
  skipped: number;
  failures: number;
}

export interface EnrichmentWorkflowResult {
  steps: EnrichmentStepState[];
  failedStepIds: string[];
  summary: EnrichmentWorkflowSummary;
}

export interface EnrichmentWorkflowOptions {
  onlyStepIds?: readonly string[];
  onChange?: (steps: readonly EnrichmentStepState[]) => void;
}

interface EnrichmentJobBatchConfiguration {
  useExternal?: boolean;
}

export function enrichmentBatchSizeForJob(
  job: EnrichmentJobBatchConfiguration | null | undefined,
  defaultBatchSize: number,
): number {
  const safeDefault = Math.max(1, Math.floor(defaultBatchSize));
  return job?.useExternal ? Math.min(2, safeDefault) : safeDefault;
}

export function resumedEnrichmentStepStates(
  stepIds: readonly string[],
  currentStepId: string,
  storedSteps: readonly EnrichmentStepState[] = [],
): EnrichmentStepState[] {
  const currentIndex = stepIds.indexOf(currentStepId);
  const storedById = new Map(storedSteps.map((step) => [step.id, step]));
  const hasStoredWorkflow = storedById.size > 0;
  return stepIds.map((id, index) => {
    if (id === currentStepId) return { id, status: "running" };
    const stored = storedById.get(id);
    if (stored?.status === "success") {
      return stored.result ? { ...stored, result: { ...stored.result } } : { ...stored };
    }
    if (!hasStoredWorkflow) return { id, status: "skipped" };
    return { id, status: index < currentIndex ? "success" : "pending" };
  });
}

export function mergeSuccessfulEnrichmentSteps(
  steps: readonly EnrichmentStepState[],
  previousSteps: readonly EnrichmentStepState[] = [],
): EnrichmentStepState[] {
  const previousById = new Map(previousSteps.map((step) => [step.id, step]));
  return steps.map((step) => {
    const previous = previousById.get(step.id);
    if (step.status !== "skipped" || previous?.status !== "success") return { ...step };
    return previous.result ? { ...previous, result: { ...previous.result } } : { ...previous };
  });
}

function finiteCount(value: unknown): number {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function resultCount(result: EnrichmentStepResult | undefined, keys: readonly string[]): number {
  if (!result) return 0;
  return Math.max(0, ...keys.map((key) => finiteCount(result[key])));
}

function cloneStates(states: readonly EnrichmentStepState[]): EnrichmentStepState[] {
  return states.map((state) => (state.result ? { ...state, result: { ...state.result } } : { ...state }));
}

export function summarizeEnrichmentSteps(states: readonly EnrichmentStepState[]): EnrichmentWorkflowSummary {
  const successful = states.filter((step) => step.status === "success");
  const resultFailures = successful.map((step) => resultCount(step.result, ["failures", "failed"]));
  return {
    analyzed: Math.max(0, ...successful.map((step) => resultCount(step.result, ["analyzed", "processed", "total"]))),
    updated: Math.max(
      0,
      ...successful.map((step) => resultCount(step.result, ["updated", "enriched", "recalculated"])),
    ),
    skipped: Math.max(0, ...successful.map((step) => resultCount(step.result, ["skipped"]))),
    failures: Math.max(states.filter((step) => step.status === "failed").length, ...resultFailures, 0),
  };
}

export class EnrichmentWorkflowCoordinator {
  private activeRun: Promise<EnrichmentWorkflowResult> | null = null;

  run(
    steps: readonly EnrichmentWorkflowStep[],
    options: EnrichmentWorkflowOptions = {},
  ): Promise<EnrichmentWorkflowResult> {
    if (this.activeRun) return this.activeRun;
    this.activeRun = this.execute(steps, options).finally(() => {
      this.activeRun = null;
    });
    return this.activeRun;
  }

  retryFailed(
    previous: EnrichmentWorkflowResult,
    steps: readonly EnrichmentWorkflowStep[],
    options: Omit<EnrichmentWorkflowOptions, "onlyStepIds"> = {},
  ): Promise<EnrichmentWorkflowResult> {
    if (previous.failedStepIds.length === 0) return Promise.resolve(previous);
    return this.run(steps, { ...options, onlyStepIds: previous.failedStepIds });
  }

  private async execute(
    steps: readonly EnrichmentWorkflowStep[],
    options: EnrichmentWorkflowOptions,
  ): Promise<EnrichmentWorkflowResult> {
    const selected = options.onlyStepIds ? new Set(options.onlyStepIds) : null;
    const states: EnrichmentStepState[] = steps.map((step) => ({
      id: step.id,
      status: selected && !selected.has(step.id) ? "skipped" : "pending",
    }));
    const notify = () => options.onChange?.(cloneStates(states));
    notify();

    for (const [index, step] of steps.entries()) {
      const state = states[index];
      if (!state || state.status === "skipped") continue;
      state.status = "running";
      notify();
      try {
        state.result = await step.run();
        state.status = "success";
      } catch (error) {
        state.status = "failed";
        state.error = error instanceof Error ? error.message : String(error);
      }
      notify();
    }

    return {
      steps: cloneStates(states),
      failedStepIds: states.filter((step) => step.status === "failed").map((step) => step.id),
      summary: summarizeEnrichmentSteps(states),
    };
  }
}
