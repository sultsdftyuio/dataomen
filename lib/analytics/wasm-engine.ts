/**
 * @file lib/analytics/wasm-engine.ts
 * @description Client-side Analytical Engine using DuckDB-WASM.
 * Adheres to the Modular Strategy and Analytical Efficiency paradigms.
 * Executes columnar data operations entirely in the user's browser via WebWorkers.
 */

import * as duckdb from '@duckdb/duckdb-wasm';
import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { Table } from 'apache-arrow';

// ---------------------------------------------------------------------------
// Type Definitions & Errors
// ---------------------------------------------------------------------------

export interface WasmEngineStatus {
  isInitialized: boolean;
  activeTables: string[];
  totalQueriesRun: number;
}

export class WasmEngineError extends Error {
  constructor(message: string, public readonly originalError?: unknown) {
    super(message);
    this.name = 'WasmEngineError';
  }
}

// ---------------------------------------------------------------------------
// Engine Implementation
// ---------------------------------------------------------------------------

class WasmAnalyticalEngine {
  private static instance: WasmAnalyticalEngine;
  
  private db: AsyncDuckDB | null = null;
  private connection: AsyncDuckDBConnection | null = null;
  private workerUrl: string | null = null;
  
  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null; // Concurrency lock for React StrictMode
  
  private activeTables: Set<string> = new Set();
  private queryCount: number = 0;

  private constructor() {
    // Private constructor enforces Singleton pattern across the application state
  }

  /**
   * Returns the singleton instance of the Engine.
   */
  public static getInstance(): WasmAnalyticalEngine {
    if (!WasmAnalyticalEngine.instance) {
      WasmAnalyticalEngine.instance = new WasmAnalyticalEngine();
    }
    return WasmAnalyticalEngine.instance;
  }

  /**
   * Bootstraps DuckDB-WASM safely. 
   * Utilizes a Promise lock to prevent race conditions during React double-mounts.
   */
  public async initialize(): Promise<void> {
    if (this.initialized) return;
    
    // If initialization is already in flight, wait for it to finish
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._initializeInternal();
    return this.initPromise;
  }

  private async _initializeInternal(): Promise<void> {
    try {
      // 1. Resolve DuckDB bundles via jsdelivr to avoid Next.js Webpack worker bundling issues
      const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
      
      // 2. Select the optimal bundle (eh vs coi vs mvp) based on browser WASM features
      const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

      if (!bundle.mainWorker) {
        throw new Error('DuckDB bundle did not provide a valid mainWorker URL.');
      }

      // 3. Instantiate the Web Worker safely
      this.workerUrl = URL.createObjectURL(
        new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' })
      );
      const worker = new Worker(this.workerUrl);
      const logger = new duckdb.ConsoleLogger();

      // 4. Create the Async DuckDB instance
      this.db = new AsyncDuckDB(logger, worker);
      await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);

      // 5. Establish a global read-only analytical connection
      this.connection = await this.db.connect();
      this.initialized = true;
      
      console.info(`[WasmEngine] Successfully initialized DuckDB-WASM engine.`);
    } catch (error) {
      console.error('[WasmEngine] Critical failure during bootstrap:', error);
      this.initPromise = null; // Free the lock so we can retry
      throw new WasmEngineError('Failed to bootstrap local analytical engine.', error);
    }
  }

  /**
   * Fetches a Parquet file from a given pre-signed URL (e.g., Cloudflare R2),
   * mounts it into the WASM virtual filesystem, and creates a queryable view.
   * @param tableName The SQL alias to register this dataset under (e.g., 'shopify_sales')
   * @param parquetUrl The pre-signed URL pointing to the .parquet file
   */
  public async mountParquetFromUrl(tableName: string, parquetUrl: string): Promise<void> {
    this.ensureInitialized();

    try {
      // Idempotency check: Don't remount if it already exists to save network bandwidth
      if (this.activeTables.has(tableName)) {
        console.debug(`[WasmEngine] Table ${tableName} is already mounted. Skipping.`);
        return;
      }

      const fileName = `${tableName}.parquet`;

      // Register the file URL into DuckDB's virtual file system
      await this.db!.registerFileURL(fileName, parquetUrl, duckdb.DuckDBDataProtocol.HTTP, false);
      
      // Create a view to abstract the file reading, optimizing columnar access
      await this.connection!.query(`
        CREATE OR REPLACE VIEW ${tableName} AS 
        SELECT * FROM read_parquet('${fileName}');
      `);

      this.activeTables.add(tableName);
      console.info(`[WasmEngine] Successfully mounted Parquet view: ${tableName}`);
    } catch (error) {
      throw new WasmEngineError(`Error mounting parquet for table ${tableName}`, error);
    }
  }

  /**
   * Executes a standard, vectorized SQL query against the mounted local tables.
   * @param query The raw SQL string to execute
   * @returns An Apache Arrow Table (Optimized for WebGL rendering)
   */
  public async executeQuery(query: string): Promise<Table> {
    this.ensureInitialized();
    
    try {
      const startTime = performance.now();
      const arrowResult = await this.connection!.query(query);
      const latency = performance.now() - startTime;
      
      this.queryCount++;
      console.debug(`[WasmEngine] Query executed in ${latency.toFixed(2)}ms`);
      
      // FIX: Cast via unknown to bypass strict version mismatches between DuckDB's internal Arrow and the latest pnpm Arrow
      return arrowResult as unknown as Table;
    } catch (error) {
      throw new WasmEngineError(`Query execution failed: ${query}`, error);
    }
  }

  /**
   * Executes a parameterized query using prepared statements. 
   * This is critical for security (preventing injection from user-defined dashboard filters)
   * and performance (DuckDB caches the AST plan).
   * @param query The SQL string with '?' placeholders
   * @param params Array of parameters to bind
   * @returns An Apache Arrow Table
   */
  public async executePrepared(query: string, params: any[]): Promise<Table> {
    this.ensureInitialized();

    let stmt;
    try {
      const startTime = performance.now();
      
      stmt = await this.connection!.prepare(query);
      const arrowResult = await stmt.query(...params);
      
      const latency = performance.now() - startTime;
      this.queryCount++;
      
      console.debug(`[WasmEngine] Prepared query executed in ${latency.toFixed(2)}ms`);
      
      // FIX: Cast via unknown to bypass strict version mismatches
      return arrowResult as unknown as Table;
    } catch (error) {
      throw new WasmEngineError(`Prepared query execution failed.`, error);
    } finally {
      if (stmt) {
        await stmt.close();
      }
    }
  }

  /**
   * Converts an Apache Arrow Table into a standard array of JSON objects.
   * Useful for backwards compatibility with existing standard React components (e.g., Recharts).
   * Note: For massive datasets and WebGL, pass the Arrow Table directly to the renderer.
   * @param arrowTable The result from executeQuery
   */
  public arrowToJson<T = any>(arrowTable: Table): T[] {
    return arrowTable.toArray() as T[];
  }

  /**
   * Tears down the connection, worker, and clears memory. 
   * Should be invoked on App unmount or strict memory-cleanup routines.
   */
  public async terminate(): Promise<void> {
    if (this.connection) {
      await this.connection.close();
      this.connection = null;
    }
    if (this.db) {
      await this.db.terminate();
      this.db = null;
    }
    if (this.workerUrl) {
      URL.revokeObjectURL(this.workerUrl);
      this.workerUrl = null;
    }
    
    this.initialized = false;
    this.initPromise = null;
    this.activeTables.clear();
    
    console.info('[WasmEngine] Terminated WASM worker and cleared memory.');
  }

  /**
   * Returns system diagnostics for the UI.
   */
  public getStatus(): WasmEngineStatus {
    return {
      isInitialized: this.initialized,
      activeTables: Array.from(this.activeTables),
      totalQueriesRun: this.queryCount
    };
  }

  /**
   * Internal guard to ensure operations don't fire before bootstrap completes.
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.db || !this.connection) {
      throw new WasmEngineError('Engine not initialized. You must await WasmEngine.initialize() first.');
    }
  }
}

// Export a singleton instance for global app usage
export const WasmEngine = WasmAnalyticalEngine.getInstance();