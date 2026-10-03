"use client";

import { Loader2, Plus, SlidersHorizontal } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { TARGET_TYPES, type TargetType } from "@/lib/targeting-brief";
import { C } from "@/lib/tokens";
import "./manual-target-form.css";

type ManualTargetInput = { entityKind: TargetType; canonicalUrl: string; title?: string };
type ActionResult = { ok: boolean; message: string };
const TARGET_LABELS: Record<TargetType, string> = {
  account: "Account or team",
  builder: "Independent builder",
  project: "Project or product",
};

/** The server validates and stores the public reference; no contact details are collected here. */
export function ManualTargetForm({ allowedTargetTypes, onCreate }: { allowedTargetTypes: readonly TargetType[]; onCreate: (input: ManualTargetInput) => Promise<ActionResult> }) {
  const router = useRouter();
  const [entityKind, setEntityKind] = useState<TargetType>(allowedTargetTypes[0] ?? TARGET_TYPES[0]);
  const [canonicalUrl, setCanonicalUrl] = useState("");
  const [title, setTitle] = useState("");
  const [notice, setNotice] = useState<ActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await onCreate({ entityKind, canonicalUrl, title: entityKind === "builder" ? undefined : title });
        setNotice(result);
        if (result.ok) { setCanonicalUrl(""); setTitle(""); router.refresh(); }
      } catch {
        setNotice({ ok: false, message: "Could not add this target. Try again." });
      }
    });
  };

  return <section className="arc-target-entry" aria-labelledby="manual-target-heading">
    <div className="arc-target-entry__header"><div><h2 id="manual-target-heading">Research a public target</h2><p>Start with a public URL. Arcli checks fit against your brief and shows the evidence it found.</p></div><span>Public sources only</span></div>
    <form onSubmit={submit}>
      <div className="arc-target-entry__main"><label className="sr-only" htmlFor="target-url">Public website or profile URL</label><input id="target-url" required type="url" inputMode="url" autoComplete="url" spellCheck={false} value={canonicalUrl} placeholder="Company or project URL, e.g. https://example.com" disabled={isPending} onChange={(event) => setCanonicalUrl(event.target.value)} /><button type="submit" disabled={isPending || allowedTargetTypes.length === 0}>{isPending ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />}{isPending ? "Adding..." : "Research this target"}</button></div>
      <details className="arc-target-entry__options"><summary><SlidersHorizontal size={14} />Target type and display name</summary><div className="arc-target-entry__fields"><label>Target type<select value={entityKind} disabled={isPending} onChange={(event) => setEntityKind(event.target.value as TargetType)}>{allowedTargetTypes.map((kind) => <option key={kind} value={kind}>{TARGET_LABELS[kind]}</option>)}</select></label>{entityKind !== "builder" ? <label>Display name <span>(optional)</span><input value={title} maxLength={240} placeholder={entityKind === "project" ? "Project name" : "Company name"} disabled={isPending} onChange={(event) => setTitle(event.target.value)} /></label> : <p>Arcli uses the public URL as the builder identity. Do not add personal contact details.</p>}</div></details>
      {notice ? <p className="arc-target-entry__notice" role="status" style={{ color: notice.ok ? C.green : C.red }}>{notice.message}</p> : null}
    </form>
  </section>;
}
