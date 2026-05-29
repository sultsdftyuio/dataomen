import { NextResponse } from "next/server";
import { handleWorkspaceUpdate } from "@/lib/settings/api";
import { createClient } from "@/utils/supabase/server";

type WorkspacePhase = "PROVISIONING" | "INTEGRATION" | "BACKFILLING" | "READY" | "FAILED";

const jsonResponse = (body: unknown, init?: ResponseInit) =>
	NextResponse.json(body, {
		...init,
		headers: {
			"Cache-Control": "no-store",
			...(init?.headers ?? {}),
		},
	});

export async function GET() {
	const supabase = await createClient();
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();

	if (authError || !user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
	}

	const { data: mapping, error: mappingError } = await supabase
		.from("tenant_users")
		.select("tenant_id, user_id")
		.eq("user_id", user.id)
		.maybeSingle();

	if (mappingError) {
		return jsonResponse({ error: "Failed to resolve workspace phase." }, { status: 500 });
	}

	if (!mapping?.tenant_id) {
		return jsonResponse(
			{
				status: "PROVISIONING" satisfies WorkspacePhase,
				phase: "PROVISIONING" satisfies WorkspacePhase,
				message: "Provisioning your workspace.",
			},
			{ status: 200 }
		);
	}

	const { data: tenantRow, error: tenantError } = await supabase
		.from("tenants")
		.select("status")
		.eq("tenant_id", String(mapping.tenant_id))
		.maybeSingle();

	if (tenantError) {
		return jsonResponse({ error: "Failed to resolve workspace phase." }, { status: 500 });
	}

	const phase = (tenantRow?.status as WorkspacePhase | undefined) ?? "PROVISIONING";
	const message =
		phase === "INTEGRATION"
			? "Waiting for the Stripe connection to be completed."
			: phase === "BACKFILLING"
				? "Building your baseline from recent Stripe history."
				: phase === "FAILED"
					? "Provisioning failed."
					: phase === "READY"
						? "Workspace ready."
						: "Provisioning your workspace.";

	return jsonResponse({
		status: phase,
		phase,
		message,
		tenantId: String(mapping.tenant_id),
		userId: String(mapping.user_id ?? user.id),
	});
}

export const POST = handleWorkspaceUpdate;