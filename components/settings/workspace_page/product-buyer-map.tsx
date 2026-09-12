"use client";

import type { ComponentType } from "react";
import {
  Ban,
  Lightbulb,
  MessagesSquare,
  Target,
  Users,
} from "lucide-react";

import type { ServiceProfileFields } from "@/app/(dashboard)/dashboard/prospect-types";
import { Button } from "@/components/ui/button";
import { buildProductBuyerMap } from "@/lib/product-buyer-map";
import { C } from "@/lib/tokens";

export type ProductBuyerMapSection = "match" | "signals" | "guardrails";

type MapAreaProps = {
  title: string;
  description: string;
  emptyMessage: string;
  items: readonly string[];
  section: ProductBuyerMapSection;
  editLabel: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  accent: string;
  accentBackground: string;
  onEdit: (section: ProductBuyerMapSection) => void;
};

function MapArea({
  title,
  description,
  emptyMessage,
  items,
  section,
  editLabel,
  icon: Icon,
  accent,
  accentBackground,
  onEdit,
}: MapAreaProps) {
  const hasItems = items.length > 0;

  return (
    <article
      className="flex min-h-48 flex-col rounded-lg border bg-background p-3"
      style={{ borderColor: C.rule }}
    >
      <div className="flex items-start gap-2.5">
        <div
          className="flex size-8 shrink-0 items-center justify-center rounded-md"
          style={{ color: accent, backgroundColor: accentBackground }}
        >
          <Icon className="size-4" aria-hidden={true} />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold" style={{ color: C.navy }}>
            {title}
          </h3>
          <p className="mt-0.5 text-xs leading-5" style={{ color: C.muted }}>
            {description}
          </p>
        </div>
      </div>

      {hasItems ? (
        <ul className="mt-3 space-y-1.5">
          {items.map((item) => (
            <li
              key={item.toLocaleLowerCase()}
              className="rounded-md border px-2.5 py-1.5 text-xs leading-5"
              style={{ borderColor: C.rule, color: C.navySoft }}
            >
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p
          className="mt-3 rounded-md border border-dashed px-2.5 py-2 text-xs leading-5"
          style={{ borderColor: C.ruleDark, color: C.muted }}
        >
          {emptyMessage}
        </p>
      )}

      <Button
        type="button"
        size="xs"
        variant="outline"
        className="mt-auto self-start"
        style={{ borderColor: C.ruleDark, color: C.navySoft }}
        onClick={() => onEdit(section)}
      >
        {editLabel}
      </Button>
    </article>
  );
}

export function ProductBuyerMap({
  fields,
  onEdit,
}: {
  fields: ServiceProfileFields;
  onEdit: (section: ProductBuyerMapSection) => void;
}) {
  const buyerLanguage =
    fields.discovery_queries.length > 0
      ? fields.discovery_queries.map((query) => query.phrase)
      : fields.search_terms;
  const map = buildProductBuyerMap({
    valueProposition: fields.unique_value_prop,
    coreProblem: fields.core_problem,
    targetAudience: fields.target_audience,
    painPoints: fields.pain_points,
    useCases: fields.use_cases,
    buyingTriggers: fields.buying_triggers,
    urgencySignals: fields.urgency_signals,
    buyerLanguage,
    negativeKeywords: fields.negative_keywords,
    excludedAudiences: fields.excluded_audiences,
  });

  return (
    <section
      className="overflow-hidden rounded-xl border bg-white shadow-sm"
      style={{ borderColor: C.rule }}
      aria-labelledby="product-buyer-map-title"
    >
      <div className="border-b px-4 py-3.5" style={{ borderColor: C.rule }}>
        <p
          className="text-[10px] font-bold uppercase tracking-[0.15em]"
          style={{ color: C.blue }}
        >
          Crawl-derived hypothesis
        </p>
        <h2
          id="product-buyer-map-title"
          className="pfd mt-1 text-2xl leading-none"
          style={{ color: C.navy }}
        >
          Product & buyer map
        </h2>
        <p className="mt-2 max-w-3xl text-xs leading-5" style={{ color: C.muted }}>
          This is what Arcli currently understands from your website about the
          product, buyer, and conversations worth finding. Open any area to
          refine it; your edits update this map immediately and become the
          matching source of truth when saved.
        </p>
      </div>

      <div className="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-3">
        <MapArea
          title="Product positioning"
          description="What you offer and the costly outcome it improves."
          emptyMessage="Add a core problem and differentiated value proposition."
          items={map.positioning}
          section="match"
          editLabel="Edit the match"
          icon={Lightbulb}
          accent={C.blue}
          accentBackground={C.bluePale}
          onEdit={onEdit}
        />
        <MapArea
          title="Ideal buyers"
          description="Roles, teams, and company situations most likely to act."
          emptyMessage="Add the roles, teams, or company types that buy."
          items={map.idealBuyers}
          section="match"
          editLabel="Edit buyers"
          icon={Users}
          accent={C.green}
          accentBackground={C.greenPale}
          onEdit={onEdit}
        />
        <MapArea
          title="Problems & moments"
          description="Pains, outcomes, events, and urgency behind a real need."
          emptyMessage="Add pains, use cases, triggers, or urgency signals."
          items={map.buyerProblems}
          section="signals"
          editLabel="Edit signals"
          icon={Target}
          accent={C.blue}
          accentBackground={C.bluePale}
          onEdit={onEdit}
        />
        <MapArea
          title="Buyer language"
          description="Natural wording people may use in a public conversation."
          emptyMessage="Add buyer-language phrases or complete the query plan."
          items={map.buyerLanguage}
          section="signals"
          editLabel="Edit language"
          icon={MessagesSquare}
          accent={C.green}
          accentBackground={C.greenPale}
          onEdit={onEdit}
        />
        <MapArea
          title="Outside the map"
          description="Audiences and meanings that should not become leads."
          emptyMessage="Add excluded audiences and negative keywords."
          items={map.exclusions}
          section="guardrails"
          editLabel="Edit guardrails"
          icon={Ban}
          accent={C.amber}
          accentBackground={C.amberPale}
          onEdit={onEdit}
        />
      </div>
    </section>
  );
}
