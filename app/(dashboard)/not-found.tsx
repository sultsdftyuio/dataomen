import Link from "next/link";
import { FileQuestion } from "lucide-react";

import { EmptyState } from "@/components/dashboard/EmptyState";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";

/**
 * notFound() inside the dashboard renders here, within the shell. Without it
 * the root marketing 404 rendered inside the shell, adding a second <main>.
 * Today's prospects also lands here for workspaces outside its pilot, so the
 * copy covers "not turned on" as well as a wrong address.
 */
export default function DashboardNotFound() {
  return (
    <div className="arc-workspace-page">
      <PageHeader title="Page not found" />
      <EmptyState
        variant="never-used"
        icon={FileQuestion}
        title="This page isn't available"
        description="The address may be wrong, or this page isn't turned on for your workspace. Your signals and targeting brief are unaffected."
        action={
          <Button asChild>
            <Link href="/dashboard">Go to Signals</Link>
          </Button>
        }
      />
    </div>
  );
}
