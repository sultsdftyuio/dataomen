import { PageSkeleton } from "@/components/dashboard/PageSkeleton";

export default function DashboardLoading() {
  return <PageSkeleton variant="list-detail" page="prospects" withActions />;
}
