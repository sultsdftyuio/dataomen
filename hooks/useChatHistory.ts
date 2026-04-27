// hooks/useChatHistory.ts
"use client";

/**
 * SWR-powered chat history hydration hook.
 *
 * Provides instant cache invalidation on session switches, preventing stale
 * message rendering.  Also exposes a mutator for optimistic writes so the
 * ChatLayout can persist user/assistant messages without round-tripping.
 */

import useSWR, { type KeyedMutator, type SWRConfiguration } from "swr";
import { createClient } from "@/utils/supabase/client";
import {
  mapMessageRow,
  type ChatMessageRecord,
} from "@/lib/chat-history";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatHistoryData {
  messages: ChatMessageRecord[];
  storeStatus: "ok" | "missing_tables" | "error";
}

export interface UseChatHistoryReturn {
  /** Sorted messages for the active session (oldest → newest). */
  messages: ChatMessageRecord[];
  /** `true` during the initial fetch for a *new* session id. */
  isLoading: boolean;
  /** `true` when revalidating in the background (stale data is still shown). */
  isValidating: boolean;
  /** Non-null when the last request failed. */
  error: Error | null;
  /** Backend store status flag — `missing_tables` means migrations haven't run. */
  storeStatus: ChatHistoryData["storeStatus"];
  /** SWR mutator — call to revalidate or perform optimistic updates. */
  mutate: KeyedMutator<ChatHistoryData>;
  /**
   * Persist a message to the backend and optimistically prepend it to the
   * local cache.  Returns the saved `ChatMessageRecord` on success.
   */
  appendMessage: (
    role: "user" | "assistant" | "system",
    content: string,
    metadata?: Record<string, unknown>,
    isPartial?: boolean,
  ) => Promise<ChatMessageRecord | null>;
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

async function fetchSessionMessages(
  sessionId: string,
): Promise<ChatHistoryData> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return { messages: [], storeStatus: "error" };
  }

  const res = await fetch(
    `/api/chat/sessions/${encodeURIComponent(sessionId)}/messages`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    },
  );

  if (!res.ok) {
    throw new Error(`Failed to fetch messages: HTTP ${res.status}`);
  }

  const body = await res.json();
  const raw: unknown[] = Array.isArray(body?.messages) ? body.messages : [];
  const messages = raw
    .map(mapMessageRow)
    .filter((m): m is ChatMessageRecord => Boolean(m));

  return {
    messages,
    storeStatus: body?.storeStatus ?? "ok",
  };
}

/**
 * SWR cache key factory.  Returns `null` when there is no active session
 * which tells SWR to skip the request entirely.
 */
function chatHistoryKey(sessionId: string | null | undefined) {
  if (!sessionId) return null;
  return `chat-history:${sessionId}`;
}

// ---------------------------------------------------------------------------
// SWR Config Defaults
// ---------------------------------------------------------------------------

const DEFAULT_SWR_OPTIONS: SWRConfiguration<ChatHistoryData> = {
  /**
   * Re-fetch on window focus so the user always sees the latest state after
   * switching tabs (e.g. if another tab persisted messages).
   */
  revalidateOnFocus: true,

  /**
   * Keep stale data visible while revalidating — prevents a blank flash when
   * the user re-opens a session they were just in.
   */
  keepPreviousData: false,

  /**
   * Deduplicate identical requests within a 2-second window.  During rapid
   * session switches this avoids hammering the API.
   */
  dedupingInterval: 2000,

  /**
   * If the API 404s or 5xxs, retry up to 3 times with exponential backoff
   * before surfacing the error.
   */
  errorRetryCount: 3,

  /**
   * The fetcher is wired in-hook rather than globally so callers don't need
   * to configure an `SWRConfig` provider.
   */
  fetcher: undefined,
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useChatHistory(
  sessionId: string | null | undefined,
  options?: SWRConfiguration<ChatHistoryData>,
): UseChatHistoryReturn {
  const key = chatHistoryKey(sessionId);

  const {
    data,
    error: swrError,
    isLoading,
    isValidating,
    mutate,
  } = useSWR<ChatHistoryData>(
    key,
    // The fetcher receives the SWR key; we extract the sessionId from it.
    async (cacheKey: string) => {
      const id = cacheKey.replace("chat-history:", "");
      return fetchSessionMessages(id);
    },
    {
      ...DEFAULT_SWR_OPTIONS,
      ...options,
    },
  );

  const messages = data?.messages ?? [];
  const storeStatus = data?.storeStatus ?? "ok";

  /**
   * Optimistic append + backend persist.
   *
   * 1. Immediately writes a placeholder record to the SWR cache.
   * 2. POSTs the message to the API route.
   * 3. On success, replaces the optimistic entry with the real server record.
   * 4. On failure, rolls back the cache to the previous state.
   */
  const appendMessage = async (
    role: "user" | "assistant" | "system",
    content: string,
    metadata?: Record<string, unknown>,
    isPartial = false,
  ): Promise<ChatMessageRecord | null> => {
    if (!sessionId) return null;

    const now = new Date().toISOString();
    const optimisticRecord: ChatMessageRecord = {
      id: `optimistic-${Date.now()}`,
      sessionId,
      role,
      content,
      metadata: metadata ?? null,
      isPartial,
      createdAt: now,
      updatedAt: now,
    };

    // Optimistic update
    const previousData = data;
    await mutate(
      {
        messages: [...messages, optimisticRecord],
        storeStatus,
      },
      { revalidate: false },
    );

    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        // Roll back
        await mutate(previousData, { revalidate: false });
        return null;
      }

      const res = await fetch(
        `/api/chat/sessions/${encodeURIComponent(sessionId)}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ role, content, metadata, isPartial }),
        },
      );

      if (!res.ok) {
        await mutate(previousData, { revalidate: false });
        return null;
      }

      const body = await res.json();
      const serverRecord = mapMessageRow(body?.message);

      if (!serverRecord) {
        await mutate(previousData, { revalidate: false });
        return null;
      }

      // Replace the optimistic record with the real one
      await mutate(
        {
          messages: [
            ...messages.filter((m) => m.id !== optimisticRecord.id),
            serverRecord,
          ],
          storeStatus,
        },
        { revalidate: false },
      );

      return serverRecord;
    } catch {
      // Roll back on network failure
      await mutate(previousData, { revalidate: false });
      return null;
    }
  };

  return {
    messages,
    isLoading,
    isValidating,
    error: swrError ?? null,
    storeStatus,
    mutate,
    appendMessage,
  };
}
