"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether the rail's rings may move (the slow drift and the ripple on
 * arrival). It's a per-device choice, like the system's reduce-motion
 * setting, so it lives in localStorage rather than the account. The
 * system setting still wins: CSS stops the drift under reduced motion.
 */
const STORAGE_KEY = "arcli:rail-motion";
const listeners = new Set<() => void>();
// Set by setRailMotion so the choice applies even where storage is blocked.
let chosen: boolean | null = null;

/** The saved choice, read directly (for effects that run before a re-render). */
export function readRailMotion(): boolean {
  if (chosen !== null) return chosen;
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // Another tab changed it.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    chosen = null;
    onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** True unless this device turned the motion off. The server renders it on. */
export function useRailMotion(): boolean {
  return useSyncExternalStore(subscribe, readRailMotion, () => true);
}

export function setRailMotion(on: boolean) {
  chosen = on;
  try {
    if (on) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, "off");
  } catch {
    // Storage blocked: `chosen` still applies until the page reloads.
  }
  listeners.forEach((listener) => listener());
}
