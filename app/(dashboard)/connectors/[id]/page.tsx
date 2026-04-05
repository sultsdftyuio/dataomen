// app/(dashboard)/connectors/[id]/page.tsx
import { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConnectorDashboard } from "@/components/dashboard/ConnectorDashboard";

// -----------------------------------------------------------------------------
// Type Definitions
// -----------------------------------------------------------------------------
interface ConnectorPageProps {
  params: {
    id: string;
  };
}

// -----------------------------------------------------------------------------
// Dynamic Metadata (SEO & Browser Tabs)
// -----------------------------------------------------------------------------
export async function generateMetadata({ params }: ConnectorPageProps): Promise<Metadata> {
  const integration = params.id;
  
  if (!integration) {
    return {
      title: "Connector Not Found | Arcli",
    };
  }

  const formattedName = integration.charAt(0).toUpperCase() + integration.slice(1);

  return {
    title: `${formattedName} Intelligence | Arcli Smart Hub`,
    description: `Real-time executive intelligence and canonical data modeling for ${formattedName}.`,
  };
}

// -----------------------------------------------------------------------------
// Smart Hub Route Handler (Server Component)
// -----------------------------------------------------------------------------
export default function ConnectorPage({ params }: ConnectorPageProps) {
  // 1. Validate route parameters
  if (!params.id) {
    notFound();
  }

  // 2. Normalize the identifier for downstream processing (e.g., API matching)
  const integrationName = params.id.toLowerCase().trim();

  // 3. Render the Smart Hub layout shell
  return (
    <main className="flex-1 w-full h-full bg-[#fafafa] min-h-screen px-4 md:px-8 pt-6">
      {/* The ConnectorDashboard component enforces the strict Phase 1 Layout Contract:
        Header -> ExecutiveKPIStrip -> AnalyticalGrid + InsightsFeed -> Scratchpad
      */}
      <ConnectorDashboard integrationName={integrationName} />
    </main>
  );
}