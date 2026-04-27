// hooks/useSmartAutoScroll.ts
"use client";

/**
 * Smart Auto-Scrolling Hook
 *
 * Attaches a ResizeObserver to the message list container and intelligently
 * manages scroll behavior during streaming:
 *
 * - If the user's scroll position is at the absolute bottom, auto-scroll
 *   with incoming chunks.
 * - **Crucial UX**: If the user scrolls up even 1 pixel during generation,
 *   auto-scroll is disabled to prevent hijacking their reading experience.
 * - Re-enables auto-scroll when the user manually scrolls back to the bottom.
 */

import { useRef, useEffect, useCallback } from "react";

/** Distance (px) from the bottom at which we consider the user "at bottom". */
const BOTTOM_THRESHOLD_PX = 4;

export interface UseSmartAutoScrollOptions {
  /** Whether the AI is currently streaming content. */
  isStreaming: boolean;
}

export interface UseSmartAutoScrollReturn {
  /**
   * Ref to attach to the scrollable container element
   * (the element whose `scrollHeight` grows as messages arrive).
   */
  scrollContainerRef: React.RefObject<HTMLElement | null>;
  /**
   * Ref to attach to an invisible anchor element at the very bottom of the
   * message list.  The hook scrolls this element into view when auto-scroll
   * is active.
   */
  scrollAnchorRef: React.RefObject<HTMLDivElement | null>;
  /**
   * Whether the user is currently considered "at the bottom".
   * Useful for showing a "scroll to bottom" FAB.
   */
  isAtBottom: boolean;
  /**
   * Imperatively scroll to the bottom (e.g. when the user clicks the FAB).
   */
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}

export function useSmartAutoScroll({
  isStreaming,
}: UseSmartAutoScrollOptions): UseSmartAutoScrollReturn {
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);

  // Mutable refs so the ResizeObserver callback never captures stale state.
  const isAtBottomRef = useRef(true);
  const wasAtBottomBeforeStreamRef = useRef(true);
  const isStreamingRef = useRef(isStreaming);

  // Keep isStreamingRef in sync.
  useEffect(() => {
    isStreamingRef.current = isStreaming;

    // When a stream starts, snapshot the current scroll position.
    if (isStreaming) {
      wasAtBottomBeforeStreamRef.current = isAtBottomRef.current;
    }
  }, [isStreaming]);

  // ------------------------------------------------------------------
  // Scroll position tracking
  // ------------------------------------------------------------------
  const checkIsAtBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Support both direct scrollable containers and Radix ScrollArea viewports.
    const viewport =
      container.querySelector<HTMLElement>(
        "[data-slot='scroll-area-viewport']",
      ) ?? container;

    const distanceFromBottom =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;

    isAtBottomRef.current = distanceFromBottom <= BOTTOM_THRESHOLD_PX;
  }, []);

  // ------------------------------------------------------------------
  // Scroll event listener – detects the user scrolling up during a stream
  // ------------------------------------------------------------------
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const viewport =
      container.querySelector<HTMLElement>(
        "[data-slot='scroll-area-viewport']",
      ) ?? container;

    const handleScroll = () => {
      checkIsAtBottom();
    };

    viewport.addEventListener("scroll", handleScroll, { passive: true });
    // Run once to initialise.
    checkIsAtBottom();

    return () => {
      viewport.removeEventListener("scroll", handleScroll);
    };
  }, [checkIsAtBottom]);

  // ------------------------------------------------------------------
  // ResizeObserver – fires when the container grows (new content chunks)
  // ------------------------------------------------------------------
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const viewport =
      container.querySelector<HTMLElement>(
        "[data-slot='scroll-area-viewport']",
      ) ?? container;

    // Observe size changes on the *first child* of the viewport (the actual
    // content wrapper).  This fires whenever new streamed text increases the
    // scroll height.
    const target = viewport.firstElementChild ?? viewport;

    const observer = new ResizeObserver(() => {
      // Only auto-scroll if:
      //  1. A stream is actively running, AND
      //  2. The user was at the bottom when streaming started (or scrolled
      //     back to the bottom during the stream).
      if (isStreamingRef.current && isAtBottomRef.current) {
        scrollAnchorRef.current?.scrollIntoView({
          behavior: "auto", // "auto" avoids jank during high-frequency updates
          block: "end",
        });
      }
    });

    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, []);

  // ------------------------------------------------------------------
  // Public helpers
  // ------------------------------------------------------------------
  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      scrollAnchorRef.current?.scrollIntoView({ behavior, block: "end" });
      // Force the ref to true so the ResizeObserver picks up auto-scrolling
      // again if a stream is in progress.
      isAtBottomRef.current = true;
    },
    [],
  );

  return {
    scrollContainerRef,
    scrollAnchorRef,
    isAtBottom: isAtBottomRef.current,
    scrollToBottom,
  };
}
