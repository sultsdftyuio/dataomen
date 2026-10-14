import { PageSkeleton } from "@/components/dashboard/PageSkeleton";

export default function Loading() {
  return <PageSkeleton variant="list" page="live discovery" withActions className="max-w-4xl" />;
}
