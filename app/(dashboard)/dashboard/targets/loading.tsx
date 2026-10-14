import { PageSkeleton } from "@/components/dashboard/PageSkeleton";

export default function Loading() {
  return <PageSkeleton variant="list-detail" page="targets" withActions />;
}
