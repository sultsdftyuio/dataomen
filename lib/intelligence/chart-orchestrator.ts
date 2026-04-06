// lib/intelligence/chart-orchestrator.ts

/**
 * -----------------------------------------------------------------------------
 * ARCLI Intelligence System
 * Phase 4: Chart Orchestration Engine
 * -----------------------------------------------------------------------------
 * Production-grade orchestration layer for semantic view execution.
 * * Capabilities:
 * 1. Priority Queuing: Executive KPIs and critical charts load first.
 * 2. Concurrency Control: Prevents network/DuckDB saturation.
 * 3. Resource Cancellation: Integrates AbortController to kill abandoned queries.
 * 4. Fault Tolerance: Exponential backoff retries for transient failures.
 * 5. Pub/Sub Reactivity: Native subscription model for decoupled UI components.
 */

export type ChartJobStatus = "idle" | "loading" | "ready" | "error";

export interface ChartJob<T = any[]> {
  id: string;
  query: string;
  params?: Record<string, any>;
  status: ChartJobStatus;
  priority: number;
  group: string;
  result?: T;
  error?: string;
  retryCount: number;
}

export type QueryExecutor<T = any[]> = (
  query: string, 
  params?: Record<string, any>, 
  signal?: AbortSignal
) => Promise<T>;

export type OrchestratorListener<T = any[]> = (job: ChartJob<T>) => void;

interface OrchestratorOptions {
  maxConcurrency?: number;
  maxRetries?: number;
}

export class ChartOrchestrator {
  private jobs: Map<string, ChartJob> = new Map();
  private listeners: Map<string, Set<OrchestratorListener>> = new Map();
  private abortControllers: Map<string, AbortController> = new Map();
  
  private activeQueries: number = 0;
  private readonly maxConcurrency: number;
  private readonly maxRetries: number;
  private readonly queryExecutor: QueryExecutor;

  constructor(
    queryExecutor: QueryExecutor,
    options: OrchestratorOptions = {}
  ) {
    this.queryExecutor = queryExecutor;
    this.maxConcurrency = options.maxConcurrency || 3;
    this.maxRetries = options.maxRetries || 2;
  }

  /**
   * Registers a new chart job into the orchestration queue.
   * Prevents duplication and acts as a caching layer if the job is already resolved.
   */
  public addJob(jobInit: Omit<ChartJob, "status" | "result" | "error" | "retryCount">): void {
    const existingJob = this.jobs.get(jobInit.id);
    
    // Cache Hit: Avoid re-queueing if already processing or resolved
    if (existingJob && (existingJob.status === "ready" || existingJob.status === "loading")) {
      return;
    }

    const newJob: ChartJob = {
      ...jobInit,
      status: "idle",
      retryCount: 0,
    };

    this.jobs.set(jobInit.id, newJob);
    this.notifyListeners(jobInit.id);
    this.processQueue();
  }

  /**
   * Subscribes a UI component to a specific chart job.
   * Returns a deterministic cleanup function for React useEffect.
   */
  public subscribe<T = any[]>(jobId: string, listener: OrchestratorListener<T>): () => void {
    if (!this.listeners.has(jobId)) {
      this.listeners.set(jobId, new Set());
    }
    
    // Typecast safely as the generic is defined by the consumer
    this.listeners.get(jobId)!.add(listener as OrchestratorListener);

    // Immediately flush current state to the new listener
    const currentJob = this.jobs.get(jobId);
    if (currentJob) {
      listener(currentJob as ChartJob<T>);
    }

    return () => {
      this.listeners.get(jobId)?.delete(listener as OrchestratorListener);
      
      // Garbage collection: If no components are listening, kill the job to save resources
      if (this.listeners.get(jobId)?.size === 0) {
        this.cancelJob(jobId);
      }
    };
  }

  /**
   * Cancels a job, physically aborting the network request if it is in-flight.
   * Highly critical for the progressive rendering dashboard when users navigate away.
   */
  public cancelJob(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    if (job.status === "loading") {
      const controller = this.abortControllers.get(jobId);
      if (controller) {
        controller.abort("Component unmounted or job cancelled.");
        this.abortControllers.delete(jobId);
      }
      // Active queries will be decremented in the catch/finally block of executeJob
    }

    this.jobs.delete(jobId);
    this.listeners.delete(jobId);
  }

  /**
   * Clears the entire queue and aborts all active queries.
   * Use this during tenant/integration switching.
   */
  public flush(): void {
    for (const jobId of this.abortControllers.keys()) {
      this.cancelJob(jobId);
    }
    this.jobs.clear();
    this.listeners.clear();
    this.activeQueries = 0;
  }

  /**
   * Retrieves all jobs grouped by their semantic group.
   * Useful for the Omni-Graph (Phase 6) and grouped analytics UI.
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
   * Core execution loop. Enforces concurrency boundaries and strict prioritization.
   */
  private processQueue(): void {
    if (this.activeQueries >= this.maxConcurrency) return;

    const pendingJobs = Array.from(this.jobs.values()).filter(
      (j) => j.status === "idle"
    );

    if (pendingJobs.length === 0) return;

    // Deterministic Priority Sort: Higher priority executes first. 
    // Fallback to ID sorting to ensure stable execution order for equal priorities.
    pendingJobs.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));

    // Fill concurrency slots
    const availableSlots = this.maxConcurrency - this.activeQueries;
    const jobsToRun = pendingJobs.slice(0, availableSlots);

    for (const job of jobsToRun) {
      this.executeJob(job.id);
    }
  }

  /**
   * Handles the physical execution, AbortController injection, and state transitions.
   */
  private async executeJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== "idle") return;

    this.updateJob(jobId, { status: "loading" });
    this.activeQueries++;

    const abortController = new AbortController();
    this.abortControllers.set(jobId, abortController);

    try {
      const result = await this.queryExecutor(job.query, job.params, abortController.signal);
      
      this.updateJob(jobId, {
        status: "ready",
        result,
        error: undefined
      });
    } catch (error: any) {
      // Ignore abort errors as they are intentional
      if (error.name === "AbortError" || abortController.signal.aborted) {
        return; 
      }

      // Exponential Backoff Retry Logic
      if (job.retryCount < this.maxRetries) {
        console.warn(`[ChartOrchestrator] Job ${jobId} failed. Retrying (${job.retryCount + 1}/${this.maxRetries})...`);
        this.updateJob(jobId, { 
          status: "idle", 
          retryCount: job.retryCount + 1 
        });
        
        // Stagger retries to prevent thundering herd
        setTimeout(() => this.processQueue(), Math.pow(2, job.retryCount) * 1000);
      } else {
        this.updateJob(jobId, {
          status: "error",
          error: error.message || "Failed to execute canonical view.",
        });
      }
    } finally {
      this.abortControllers.delete(jobId);
      this.activeQueries--;
      this.processQueue(); // Cascade next job
    }
  }

  /**
   * Mutates the job state and alerts React subscribers of the change.
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