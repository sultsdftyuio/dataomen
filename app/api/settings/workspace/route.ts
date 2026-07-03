// app/api/settings/workspace/route.ts
import { handleWorkspaceUpdate } from "@/lib/settings/api";

export const POST = handleWorkspaceUpdate;
export const PATCH = handleWorkspaceUpdate;