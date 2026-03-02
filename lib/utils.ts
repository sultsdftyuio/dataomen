import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { createClient } from "@supabase/supabase-js";

// 1. UI utility for Tailwind classes
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// 2. Initialize and export the Supabase Client
// Ensure these environment variables are set in your .env.local file
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);