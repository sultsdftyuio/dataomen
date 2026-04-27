// hooks/useStreamParser.ts
"use client";

/**
 * Custom ReadableStream parser for SSE events from the orchestration endpoint.
 *
 * This replaces a raw fetch + manual chunk assembly loop with a declarative
 * hook.  It supports:
 *   - Token-level streaming into a mutable content buffer
 *   - AbortController-based "Stop Generation" that instantly severs the HTTP
 *     connection
 *   - Partial-chunk persistence on abort (saves whatever was generated)
 *   - Structured event dispatching (status, plan, sql, insights, etc.)
 */

import { useRef, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** All recognized SSE event types from the backend. */
export type StreamEventType =
  | "status"
  | "reasoning"
  | "warning"
  | "technical_trace"
  | "narrative"
  | "narrative_chunk"
  | "data"
  | "cache_hit"
  | "sql"
  | "plan"
  | "insights"
  | "diagnostics"
  | "predictive_insights"
  | "job_queued"
  | "error"
  | "done";

export interface StreamEvent {
  type: StreamEventType;
  content: unknown;
  message?: string;
}

export interface StreamParserCallbacks {
  /** Called for each parsed SSE event. */
  onEvent: (event: StreamEvent) => void;
  /** Called when a narrative/narrative_chunk token arrives. */
  onToken: (token: string) => void;
  /** Called when the stream completes (either naturally or via abort). */
  onDone: (reason: "complete" | "aborted" | "error") => void;
  /** Called when a fatal error occurs. */
  onError: (error: Error) => void;
}

export interface StreamParserOptions {
  /** Read timeout in ms.  If no chunk arrives within this window, abort. */
  readTimeoutMs?: number;
}

export interface UseStreamParserReturn {
  /**
   * Start streaming from the given fetch Response.
   * Returns a promise that resolves when the stream is fully consumed or
   * aborted.
   */
  consume: (response: Response, signal?: AbortSignal) => Promise<void>;
  /**
   * The AbortController for the current stream.  Call `.abort()` to trigger
   * the "Stop Generation" UX and sever the HTTP connection.
   */
  abortControllerRef: React.MutableRefObject<AbortController | null>;
  /**
   * Accumulated text content from narrative_chunk events.
   * Read this on abort to save partial generation.
   */
  accumulatedContentRef: React.MutableRefObject<string>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_READ_TIMEOUT_MS = 45_000;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useStreamParser(
  callbacks: StreamParserCallbacks,
  options?: StreamParserOptions,
): UseStreamParserReturn {
  const abortControllerRef = useRef<AbortController | null>(null);
  const accumulatedContentRef = useRef<string>("");
  const readTimeoutMs = options?.readTimeoutMs ?? DEFAULT_READ_TIMEOUT_MS;

  const consume = useCallback(
    async (response: Response, externalSignal?: AbortSignal) => {
      if (!response.body) {
        callbacks.onError(new Error("Response body is null — cannot stream."));
        callbacks.onDone("error");
        return;
      }

      // Wire up abort.
      const controller = new AbortController();
      abortControllerRef.current = controller;
      accumulatedContentRef.current = "";

      // If the caller passes an outer signal (e.g. from `req.signal`), chain it.
      const abortFromExternal = () => controller.abort();
      externalSignal?.addEventListener("abort", abortFromExternal);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const readWithTimeout = async (): Promise<
        ReadableStreamReadResult<Uint8Array>
      > => {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error("Stream read timeout")),
            readTimeoutMs,
          );

          reader.read().then(
            (result) => {
              clearTimeout(timer);
              resolve(result);
            },
            (err) => {
              clearTimeout(timer);
              reject(err);
            },
          );
        });
      };

      try {
        let doneReading = false;

        while (!doneReading) {
          if (controller.signal.aborted) {
            callbacks.onDone("aborted");
            return;
          }

          const { value, done } = await readWithTimeout();

          if (done) {
            doneReading = true;
            break;
          }

          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line.startsWith("data: ")) continue;
            const dataStr = line.slice(6).trim();
            if (!dataStr) continue;

            try {
              const parsed: StreamEvent = JSON.parse(dataStr);

              // Dispatch to the caller's handler.
              callbacks.onEvent(parsed);

              // Handle narrative tokens specially for the streaming caret UX.
              if (
                parsed.type === "narrative_chunk" ||
                parsed.type === "narrative"
              ) {
                const token =
                  typeof parsed.content === "object" &&
                  parsed.content !== null &&
                  "executive_summary" in (parsed.content as Record<string, unknown>)
                    ? String(
                        (parsed.content as Record<string, unknown>)
                          .executive_summary ?? "",
                      )
                    : String(parsed.content ?? parsed.message ?? "");

                if (token) {
                  accumulatedContentRef.current += token;
                  callbacks.onToken(token);
                }
              }

              if (parsed.type === "done") {
                doneReading = true;
                break;
              }

              if (parsed.type === "error") {
                callbacks.onError(
                  new Error(
                    String(parsed.content ?? parsed.message ?? "Unknown error"),
                  ),
                );
                doneReading = true;
                break;
              }
            } catch {
              // Incomplete JSON — will be completed in the next read.
              console.warn("[StreamParser] Failed to parse SSE chunk:", dataStr);
            }
          }
        }

        // Handle any trailing data in the buffer.
        const trailing = buffer.trim();
        if (trailing.startsWith("data: ")) {
          const trailingData = trailing.slice(6).trim();
          if (trailingData) {
            try {
              const parsed: StreamEvent = JSON.parse(trailingData);
              callbacks.onEvent(parsed);
              if (parsed.type === "done") {
                callbacks.onDone("complete");
                return;
              }
            } catch {
              // ignore incomplete trailing chunk
            }
          }
        }

        callbacks.onDone("complete");
      } catch (err: unknown) {
        if (
          err instanceof Error &&
          (err.name === "AbortError" || controller.signal.aborted)
        ) {
          callbacks.onDone("aborted");
          return;
        }

        callbacks.onError(
          err instanceof Error ? err : new Error(String(err)),
        );
        callbacks.onDone("error");
      } finally {
        externalSignal?.removeEventListener("abort", abortFromExternal);
        reader.releaseLock();
        abortControllerRef.current = null;
      }
    },
    [callbacks, readTimeoutMs],
  );

  return {
    consume,
    abortControllerRef,
    accumulatedContentRef,
  };
}
