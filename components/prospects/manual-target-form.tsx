"use client";

import { Loader2, Plus, ShieldCheck } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { TARGET_TYPES, type TargetType } from "@/lib/targeting-brief";
import { C } from "@/lib/tokens";

type ManualTargetInput = {
  entityKind: TargetType;
  canonicalUrl: string;
  title?: string;
};

type ActionResult = {
  ok: boolean;
  message: string;
};

const TARGET_LABELS: Record<TargetType, string> = {
  account: "Account or team",
  builder: "Independent builder",
  project: "Project or product",
};

/**
 * Manual targets give customers a safe first way to use entity-first
 * discovery. The server owns URL validation and all persistence; this form
 * only collects public references and never accepts contact details.
 */
export function ManualTargetForm({
  allowedTargetTypes,
  onCreate,
}: {
  allowedTargetTypes: readonly TargetType[];
  onCreate: (input: ManualTargetInput) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const firstTargetType = allowedTargetTypes[0] ?? TARGET_TYPES[0];
  const [entityKind, setEntityKind] = useState<TargetType>(firstTargetType);
  const [canonicalUrl, setCanonicalUrl] = useState("");
  const [title, setTitle] = useState("");
  const [notice, setNotice] = useState<ActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await onCreate({
          entityKind,
          canonicalUrl,
          title: entityKind === "builder" ? undefined : title,
        });
        setNotice(result);
        if (result.ok) {
          setCanonicalUrl("");
          setTitle("");
          router.refresh();
        }
      } catch {
        setNotice({ ok: false, message: "Could not add this target. Try again." });
      }
    });
  };

  return (
    <section
      aria-labelledby="manual-target-heading"
      className="rounded-xl border bg-white p-4"
      style={{ borderColor: C.rule }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="manual-target-heading" className="text-sm font-semibold" style={{ color: C.navy }}>
            Add a public target
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-5" style={{ color: C.muted }}>
            Start with a public company, builder, or project URL. This creates a high-fit research target—not a lead or a claim of buyer intent.
          </p>
        </div>
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold"
          style={{ borderColor: C.blueLight, backgroundColor: C.bluePale, color: C.blue }}
        >
          <ShieldCheck className="size-3" aria-hidden="true" />
          Public sources only
        </span>
      </div>

      <form className="mt-4 grid gap-3 md:grid-cols-[11rem_minmax(0,1fr)_minmax(0,1fr)_auto]" onSubmit={submit}>
        <label className="grid gap-1.5 text-xs font-semibold" style={{ color: C.navySoft }}>
          Target type
          <select
            value={entityKind}
            disabled={isPending}
            className="h-9 rounded-md border bg-white px-2.5 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            style={{ borderColor: C.rule, color: C.navy }}
            onChange={(event) => setEntityKind(event.target.value as TargetType)}
          >
            {allowedTargetTypes.map((kind) => (
              <option key={kind} value={kind}>{TARGET_LABELS[kind]}</option>
            ))}
          </select>
        </label>

        <label className="grid min-w-0 gap-1.5 text-xs font-semibold" style={{ color: C.navySoft }}>
          Public URL
          <input
            required
            type="url"
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            value={canonicalUrl}
            placeholder="https://example.com"
            disabled={isPending}
            className="h-9 min-w-0 rounded-md border bg-white px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            style={{ borderColor: C.rule, color: C.navy }}
            onChange={(event) => setCanonicalUrl(event.target.value)}
          />
        </label>

        {entityKind === "builder" ? (
          <p className="self-end pb-2 text-xs leading-4" style={{ color: C.muted }}>
            We use the public URL as the builder identity; do not add personal contact details.
          </p>
        ) : (
          <label className="grid min-w-0 gap-1.5 text-xs font-semibold" style={{ color: C.navySoft }}>
            Display name <span className="font-normal" style={{ color: C.muted }}>(optional)</span>
            <input
              value={title}
              maxLength={240}
              placeholder={entityKind === "project" ? "Project name" : "Company name"}
              disabled={isPending}
              className="h-9 min-w-0 rounded-md border bg-white px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              style={{ borderColor: C.rule, color: C.navy }}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
        )}

        <Button
          type="submit"
          disabled={isPending || allowedTargetTypes.length === 0}
          className="h-9 self-end bg-[#1B6EBF] px-3 text-xs text-white hover:bg-[#155a9f]"
        >
          {isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Plus className="size-3.5" aria-hidden="true" />}
          {isPending ? "Adding..." : "Add target"}
        </Button>
      </form>

      {notice ? (
        <p
          className="mt-3 text-xs leading-5"
          role="status"
          style={{ color: notice.ok ? C.green : C.amber }}
        >
          {notice.message}
        </p>
      ) : null}
    </section>
  );
}
