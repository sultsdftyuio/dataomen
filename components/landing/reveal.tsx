"use client";

import {
  type CSSProperties,
  type RefObject,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

function useReveal() {
  const ref = useRef<HTMLDivElement | HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !("IntersectionObserver" in window)
    ) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setVisible(true);
        observer.disconnect();
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, visible };
}

type RevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  style?: CSSProperties;
};

export function Reveal({ children, className = "", delay = 0, style }: RevealProps) {
  const { ref, visible } = useReveal();
  const revealStyle = {
    ...style,
    "--landing-reveal-delay": `${delay}ms`,
  } as CSSProperties;

  return (
    <div
      ref={ref as RefObject<HTMLDivElement>}
      className={`landing-reveal ${className}`}
      data-visible={visible}
      style={revealStyle}
    >
      {children}
    </div>
  );
}

type RevealWordsProps = {
  text: string;
  delay?: number;
  className?: string;
};

export function RevealWords({ text, delay = 0, className = "" }: RevealWordsProps) {
  const { ref, visible } = useReveal();
  const words = text.trim().split(/\s+/);
  const revealStyle = {
    "--landing-word-base-delay": `${delay}ms`,
  } as CSSProperties;

  return (
    <span
      ref={ref as RefObject<HTMLSpanElement>}
      className={`landing-reveal-words ${className}`}
      data-visible={visible}
      style={revealStyle}
      aria-label={text}
    >
      {words.map((word, index) => (
        <span
          key={`${word}-${index}`}
          className="landing-reveal-word"
          aria-hidden="true"
          style={{ "--landing-word-index": index } as CSSProperties}
        >
          {word}
          {index < words.length - 1 ? "\u00a0" : ""}
        </span>
      ))}
    </span>
  );
}
