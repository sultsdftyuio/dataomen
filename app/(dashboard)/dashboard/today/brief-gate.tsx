import Link from "next/link";
import { FileCheck2 } from "lucide-react";

import { EmptyState } from "@/components/dashboard/EmptyState";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";

/** Shown until the workspace has an approved targeting brief to deliver against. */
export function BriefGate() {
  return (
    <div className="arc-workspace-page">
      <PageHeader title="Today's prospects" description="Hand-checked against your targeting brief. Give each one a verdict." />
      <EmptyState
        variant="never-used"
        icon={FileCheck2}
        title="Approve your targeting brief to start deliveries"
        description="Every prospect here is checked by hand against your targeting brief, so deliveries start once you've approved it."
        action={
          <Button asChild>
            <Link href="/dashboard/brief">Review your targeting brief</Link>
          </Button>
        }
      />
    </div>
  );
}
