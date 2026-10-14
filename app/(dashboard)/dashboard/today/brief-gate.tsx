import Link from "next/link";
import { FileCheck2 } from "lucide-react";

import { EmptyState } from "@/components/dashboard/EmptyState";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";

/**
 * Shown until the workspace has a saved target universe (the targeting_profiles
 * row, labelled "Target universe" on the brief page) to deliver against.
 */
export function BriefGate() {
  return (
    <div className="arc-workspace-page">
      <PageHeader title="Today's prospects" description="Hand-checked against your targeting brief. Give each one a verdict." />
      <EmptyState
        variant="never-used"
        icon={FileCheck2}
        title="Set up your target universe to start deliveries"
        description="Every prospect here is checked by hand against the target universe in your targeting brief, so deliveries start once you've saved it."
        action={
          <Button asChild>
            <Link href="/dashboard/brief#target-universe">Set up target universe</Link>
          </Button>
        }
      />
    </div>
  );
}
