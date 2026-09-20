import { C } from "@/lib/tokens";

const surfaceBorder = "1px solid rgba(10, 22, 40, 0.10)";

export function ProductDemo() {
  return (
    <figure
      aria-label="Arcli product walkthrough"
      style={{
        background: C.navy,
        border: surfaceBorder,
        borderRadius: 18,
        boxShadow: "0 24px 60px rgba(10, 22, 40, 0.16)",
        margin: 0,
        overflow: "hidden",
      }}
    >
      <video
        autoPlay
        controls
        loop
        muted
        playsInline
        preload="metadata"
        style={{ aspectRatio: "8 / 5", display: "block", height: "auto", width: "100%" }}
      >
        <source src="/video/landing/hero-demo.mp4" type="video/mp4" />
        Your browser does not support embedded video.
      </video>
    </figure>
  );
}
