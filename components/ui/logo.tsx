import React from "react";
import { cn } from "@/lib/utils";

interface LogoProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
  iconOnly?: boolean;
}

/**
 * ARCLI Brand Component
 * Rebrand: High-performance 5-letter technical identity.
 * Concept: The "Arc & Axis" - representing structural integrity, 
 * multi-tenant isolation, and high-velocity compute.
 */
export const Logo = ({ className, iconOnly = false, ...props }: LogoProps) => {
  return (
    <div className={cn("flex items-center select-none", !iconOnly && "gap-3", className)}>
      {/* Icon: The Arc & Axis */}
      <div className="relative flex-shrink-0">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-9 h-9 text-blue-500 drop-shadow-[0_0_15px_rgba(59,130,246,0.35)]"
          {...props}
        >
          {/* Background Structural Axis */}
          <path 
            d="M12 3V21M3 12H21" 
            stroke="currentColor" 
            strokeWidth="0.5" 
            className="opacity-20"
          />
          
          {/* The Arcli Primary Arc (Represents the "Oracle" view) */}
          <path 
            d="M4 12C4 7.58172 7.58172 4 12 4C16.4183 4 20 7.58172 20 12" 
            stroke="currentColor" 
            strokeWidth="2.5" 
            strokeLinecap="round" 
          />
          
          {/* The Computing Core (The Prism Facet) */}
          <path 
            d="M12 12L17 17M12 12L7 17M12 12V20" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          />

          {/* Precision Node */}
          <circle cx="12" cy="12" r="2" fill="currentColor" />
        </svg>
      </div>

      {/* Wordmark: ARCLI */}
      {!iconOnly && (
        <div className="flex flex-col leading-none justify-center">
          <span className="text-2xl font-extrabold tracking-[-0.03em] text-slate-900 dark:text-white uppercase">
            ARCLI<span className="text-blue-500">.</span>
          </span>
        </div>
      )}
    </div>
  );
};

export default Logo;