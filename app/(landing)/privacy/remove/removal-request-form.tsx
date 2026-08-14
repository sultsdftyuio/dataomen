"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function RemovalRequestForm() {
  const [status, setStatus] = useState<"idle" | "submitting" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setStatus("submitting");
    setMessage("");

    try {
      const response = await fetch("/api/privacy/removal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          sourceUrl: form.get("sourceUrl"),
          source: form.get("source") || undefined,
          sourceHandle: form.get("sourceHandle") || undefined,
          details: form.get("details") || undefined,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
        error?: string;
      } | null;
      if (!response.ok) throw new Error(payload?.error || "We could not submit the request.");
      setStatus("sent");
      setMessage(payload?.message || "Your request has been received for identity review.");
      event.currentTarget.reset();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "We could not submit the request.");
    }
  }

  if (status === "sent") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-950">
        <CheckCircle2 className="mb-3 h-6 w-6 text-emerald-700" />
        <h2 className="text-lg font-semibold">Request received</h2>
        <p className="mt-1 text-sm leading-6">{message}</p>
        <p className="mt-3 text-sm leading-6">We will ask for enough information to confirm the request before removing or suppressing public-source content.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="space-y-2">
        <Label htmlFor="email">Your email address</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="sourceUrl">Link to the public post</Label>
        <Input id="sourceUrl" name="sourceUrl" type="url" required placeholder="https://example.com/post" />
        <p className="text-xs leading-5 text-muted-foreground">Use the original public link, not a screenshot or dashboard link. If a discussion links to an article, either link works.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="source">Where was the discussion?</Label>
        <select id="source" name="source" required defaultValue="" className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30">
          <option value="" disabled>Select the public source</option>
          <option value="hackernews">Hacker News</option>
          <option value="bluesky">Bluesky</option>
          <option value="stackexchange">Stack Exchange</option>
          <option value="github">GitHub</option>
          <option value="lemmy">Lemmy</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="sourceHandle">Public account name (optional)</Label>
        <Input id="sourceHandle" name="sourceHandle" maxLength={512} placeholder="Your public handle" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="details">Anything that helps us verify the request (optional)</Label>
        <Textarea id="details" name="details" maxLength={2000} rows={4} placeholder="For example, why you are authorised to make this request." />
      </div>
      {status === "error" && <p role="alert" className="text-sm text-destructive">{message}</p>}
      <Button type="submit" disabled={status === "submitting"} className="w-full sm:w-auto">
        {status === "submitting" && <Loader2 className="animate-spin" />}
        Submit removal request
      </Button>
    </form>
  );
}
