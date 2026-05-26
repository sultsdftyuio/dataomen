"use client";

import { CheckCircle2, ArrowRight, Play } from "lucide-react";
import Link from "next/link";

export function CTA() {
  return (
    <section
      className={`
        relative 
        overflow-hidden 
        px-6 
        py-28 
        text-center 
        text-white 
        bg-gradient-to-br from-[#1B6EBF] to-[#0F4F91] 
        border-t border-white/10 
        font-sans
      `}
    >
      {/* Subtle atmosphere accents */}
      <div 
        className={`
          absolute 
          -top-[10%] -left-[8%] 
          w-[380px] h-[380px] 
          rounded-full 
          bg-[#3b9ae8]/30 
          blur-[90px]
        `} 
      />
      <div 
        className={`
          absolute 
          -bottom-[12%] -right-[8%] 
          w-[320px] h-[320px] 
          rounded-full 
          bg-[#635bff]/20 
          blur-[80px]
        `} 
      />

      <div 
        className={`
          relative 
          z-10 
          max-w-2xl 
          mx-auto
        `}
      >
        <h2 
          className={`
            mb-4 
            text-4xl md:text-5xl 
            font-semibold 
            tracking-tight 
            leading-tight
          `}
        >
          Stop reacting to churn.<br />Start preventing it.
        </h2>
        
        <p 
          className={`
            mb-8 
            text-lg 
            text-white/90 
            leading-relaxed
          `}
        >
          Connect your billing data and launch your first automated recovery campaign in under 5 minutes.
        </p>

        {/* CTA buttons */}
        <div 
          className={`
            flex 
            flex-wrap 
            justify-center 
            gap-3 
            mb-6
          `}
        >
          <Link
            href="/register"
            className={`
              inline-flex 
              items-center 
              gap-2 
              px-4 
              h-10 
              text-sm 
              font-semibold 
              tracking-wide 
              text-[#1B6EBF] 
              bg-white 
              border border-white/20 
              rounded-lg 
              shadow-sm 
              hover:bg-gray-50 
              transition-colors
            `}
          >
            Start Saving Customers <ArrowRight size={14} />
          </Link>
          
          <Link
            href="#demo"
            className={`
              inline-flex 
              items-center 
              gap-2 
              px-4 
              h-10 
              text-sm 
              font-semibold 
              tracking-wide 
              text-white 
              bg-white/10 
              border border-white/20 
              rounded-lg 
              shadow-sm 
              hover:bg-white/20 
              transition-colors
            `}
          >
            <Play size={14} /> See Live Demo
          </Link>
        </div>

        {/* Trust nudges */}
        <div 
          className={`
            flex 
            flex-wrap 
            justify-center 
            gap-4 
            text-xs 
            font-semibold 
            tracking-wide 
            uppercase 
            text-white/80
          `}
        >
          {["3-day free trial", "Cancel anytime", "Setup in 5 minutes"].map((text, i) => (
            <span 
              key={i} 
              className={`
                flex 
                items-center 
                gap-1.5
              `}
            >
              <CheckCircle2 size={14} /> {text}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}