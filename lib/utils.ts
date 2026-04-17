import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// 1. UI utility for Tailwind classes
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

