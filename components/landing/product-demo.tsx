import { ArrowDown, CheckCircle2, FileSearch, Globe2, Sparkles } from "lucide-react";

import { C } from "@/lib/tokens";

const surfaceBorder = "1px solid rgba(10, 22, 40, 0.10)";

/**
 * A stable first frame for the future hero video. Keep this outer surface and
 * minimum height when the exported clip replaces the poster so the layout does
 * not shift while the video loads.
 */
export function ProductDemo() {
  return (
    <figure
      aria-label="Example Arcli product journey from website to reviewable buyer signal"
      style={{
        background: "#FFFFFF",
        border: surfaceBorder,
        borderRadius: 14,
        boxShadow: "0 20px 50px rgba(10, 22, 40, 0.12)",
        margin: 0,
        minHeight: 348,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          alignItems: "center",
          background: "#F8FAFC",
          borderBottom: surfaceBorder,
          display: "flex",
          justifyContent: "space-between",
          padding: "12px 14px",
        }}
      >
        <span style={{ color: C.navy, fontSize: 12, fontWeight: 700 }}>Arcli · product preview</span>
        <span
          style={{
            alignItems: "center",
            color: C.green,
            display: "inline-flex",
            fontSize: 11,
            fontWeight: 700,
            gap: 5,
          }}
        >
          <span
            aria-hidden="true"
            style={{ background: "#10B981", borderRadius: "50%", height: 6, width: 6 }}
          />
          REVIEW FLOW
        </span>
      </div>

      <div style={{ display: "grid", gap: 12, padding: 16 }}>
        <DemoCard
          icon={Globe2}
          label="YOUR WEBSITE"
          title="Product and buyer context"
          detail="Audience · pain points · buyer language"
        />
        <div style={{ alignItems: "center", color: C.blue, display: "flex", justifyContent: "center" }}>
          <ArrowDown size={17} aria-hidden="true" />
        </div>
        <DemoCard
          icon={FileSearch}
          label="PUBLIC CONVERSATION"
          title="Manual work is slowing our team"
          detail="Problem signal · real context"
          accent="blue"
        />
        <div style={{ alignItems: "center", color: C.green, display: "flex", justifyContent: "center" }}>
          <ArrowDown size={17} aria-hidden="true" />
        </div>
        <div
          style={{
            alignItems: "center",
            background: "rgba(16, 185, 129, 0.08)",
            border: "1px solid rgba(16, 185, 129, 0.20)",
            borderRadius: 10,
            display: "flex",
            gap: 10,
            padding: 12,
          }}
        >
          <span
            style={{
              alignItems: "center",
              background: "#FFFFFF",
              borderRadius: 8,
              color: C.green,
              display: "flex",
              height: 30,
              justifyContent: "center",
              width: 30,
            }}
          >
            <CheckCircle2 size={17} aria-hidden="true" />
          </span>
          <div>
            <p style={{ color: C.green, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", margin: "0 0 3px" }}>
              READY TO REVIEW
            </p>
            <p style={{ color: C.navy, fontSize: 13, fontWeight: 700, margin: 0 }}>
              Evidence and first reply prepared
            </p>
          </div>
          <Sparkles aria-hidden="true" color={C.green} size={15} style={{ marginLeft: "auto" }} />
        </div>
      </div>
    </figure>
  );
}

function DemoCard({
  icon: Icon,
  label,
  title,
  detail,
  accent = "default",
}: {
  icon: typeof Globe2;
  label: string;
  title: string;
  detail: string;
  accent?: "default" | "blue";
}) {
  const isBlue = accent === "blue";

  return (
    <div
      style={{
        alignItems: "center",
        background: isBlue ? "#F4F8FF" : "#F8FAFC",
        border: surfaceBorder,
        borderRadius: 10,
        display: "flex",
        gap: 10,
        padding: 12,
      }}
    >
      <span
        style={{
          alignItems: "center",
          background: "#FFFFFF",
          border: surfaceBorder,
          borderRadius: 8,
          color: isBlue ? C.blue : C.navySoft,
          display: "flex",
          height: 30,
          justifyContent: "center",
          width: 30,
        }}
      >
        <Icon aria-hidden="true" size={16} />
      </span>
      <div style={{ minWidth: 0 }}>
        <p style={{ color: C.muted, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", margin: "0 0 3px" }}>
          {label}
        </p>
        <p style={{ color: C.navy, fontSize: 13, fontWeight: 700, margin: "0 0 3px" }}>{title}</p>
        <p style={{ color: C.navySoft, fontSize: 11, margin: 0 }}>{detail}</p>
      </div>
    </div>
  );
}
