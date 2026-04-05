/**
 * ARCLI Intelligence System
 * Phase 4: Chart Orchestration Engine
 * * Manages the progressive loading, prioritization, and execution of chart queries.
 * Prevents network saturation and ensures executive KPIs/high-priority charts render first.
 */

export type ChartJobStatus = "idle" | "loading" | "ready" | "error";

export type ChartJob = {
  id: string;
  query: string;
  params?: Record<string, any>;
  status: ChartJobStatus;
  priority: number;
  group: string;
  result?: any;
  error?: string;
};

type OrchestratorListener = (job: ChartJob) => void;

export class ChartOrchestrator {
  private jobs: Map<string, ChartJob> = new Map();
  private listeners: Map<string, Set<OrchestratorListener>> = new Map();
  private activeQueries: number = 0;
  private readonly maxConcurrency: number;
  private readonly queryExecutor: (query: string, params?: Record<string, any>) => Promise<any>;

  constructor(
    queryExecutor: (query: string, params?: Record<string, any>) => Promise<any>,
    maxConcurrency: number = 3
  ) {
    this.queryExecutor = queryExecutor;
    this.maxConcurrency = maxConcurrency;
  }

  /**
   * Registers a new chart job into the orchestration queue.
   * If the job already exists, it ignores the registration to prevent duplication.
   */
  public addJob(jobInit: Omit<ChartJob, "status" | "result" | "error">): void {
    if (this.jobs.has(jobInit.id)) return;

    const newJob: ChartJob = {
      ...jobInit,
      status: "idle",
    };

    this.jobs.set(jobInit.id, newJob);
    this.notifyListeners(jobInit.id);
    this.processQueue();
  }

  /**
   * Subscribes a React component (or any listener) to a specific chart job.
   */
  public subscribe(jobId: string, listener: OrchestratorListener): () => void {
    if (!this.listeners.has(jobId)) {
      this.listeners.set(jobId, new Set());
    }
    this.listeners.get(jobId)!.add(listener);

    // Immediately notify the new listener of the current state
    const currentJob = this.jobs.get(jobId);
    if (currentJob) {
      listener(currentJob);
    }

    return () => {
      this.listeners.get(jobId)?.delete(listener);
    };
  }

  /**
   * Cancels a job if it's still idle or loading.
   */
  public cancelJob(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    if (job.status === "idle" || job.status === "loading") {
      this.jobs.delete(jobId);
      // We don't decrement activeQueries here if it was loading, as the promise 
      // will resolve/reject and handle decrementing. In a production app, 
      // an AbortController should be used inside the queryExecutor.
    }
  }

  /**
   * Retrieves all jobs grouped by their semantic group (e.g., 'revenue', 'customers').
   */
  public getGroupedJobs(): Record<string, ChartJob[]> {
    const grouped: Record<string, ChartJob[]> = {};
    for (const job of Array.from(this.jobs.values())) {
      if (!grouped[job.group]) grouped[job.group] = [];
      grouped[job.group].push(job);
    }
    return grouped;
  }

  /**
   * The core processing loop. Prioritizes jobs and manages concurrency.
   */
  private processQueue(): void {
    if (this.activeQueries >= this.maxConcurrency) return;

    const pendingJobs = Array.from(this.jobs.values()).filter(
      (j) => j.status === "idle"
    );

    if (pendingJobs.length === 0) return;

    // Sort by priority (higher number = higher priority)
    pendingJobs.sort((a, b) => b.priority - a.priority);

    // Pick the highest priority job
    const jobToRun = pendingJobs[0];
    this.executeJob(jobToRun.id);
  }

  /**
   * Executes the actual data fetching and manages state transitions.
   */
  private async executeJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== "idle") return;

    // Transition to loading
    this.updateJob(jobId, { status: "loading" });
    this.activeQueries++;

    try {
      const result = await this.queryExecutor(job.query, job.params);
      
      this.updateJob(jobId, {
        status: "ready",
        result,
      });
    } catch (error: any) {
      this.updateJob(jobId, {
        status: "error",
        error: error.message || "Failed to execute chart query",
      });
    } finally {
      this.activeQueries--;
      this.processQueue(); // Look for the next job
    }
  }

  /**
   * Mutates the job state and notifies relevant subscribers.
   */
  private updateJob(jobId: string, updates: Partial<ChartJob>): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const updatedJob = { ...job, ...updates };
    this.jobs.set(jobId, updatedJob);
    this.notifyListeners(jobId);
  }

  private notifyListeners(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const jobListeners = this.listeners.get(jobId);
    if (jobListeners) {
      jobListeners.forEach((listener) => listener(job));
    }
  }
}