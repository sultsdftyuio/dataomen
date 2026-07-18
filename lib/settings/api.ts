// lib/settings/api.ts
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ZodError } from "zod";
import { createClient } from "@/utils/supabase/server";
import {
  ServiceProfileSettingsSchema,
  WorkspaceSettingsSchema,
  type ServiceProfileSettingsInput,
} from "@/lib/settings/schemas";
import type { Database, Json } from "@/types/supabase";

type TenantSettingsUpdate =
  Database["public"]["Tables"]["tenant_settings"]["Update"];
type TenantSettingsInsert =
  Database["public"]["Tables"]["tenant_settings"]["Insert"];

type TenantUserMembership = {
  tenant_id: string | null;
  user_id: string | null;
  role: string | null;
};

type PostgrestLikeError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

const WORKSPACE_SETTINGS_SELECT =
  "tenant_id, company_name, sender_email, reply_to_email, website_url, updated_at";

const WORKSPACE_UPDATE_ROLES = new Set(["owner", "admin"]);

type DbRecord = Record<string, Json>;

type ServiceProfileUpdate = {
  id: string | null;
  fields: ServiceProfileSettingsInput;
};

const normalizeOptionalString = (
  value: string | undefined
): string | null | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizedRole = (role: string | null | undefined) =>
  role?.trim().toLowerCase() ?? "";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeList(values: string[]) {
  const seen = new Set<string>();
  return values.reduce<string[]>((items, value) => {
    const normalized = value.trim().replace(/\s+/g, " ");
    const key = normalized.toLowerCase();

    if (normalized && !seen.has(key)) {
      seen.add(key);
      items.push(normalized);
    }

    return items;
  }, []);
}

function parseServiceProfileUpdate(body: unknown): ServiceProfileUpdate | null {
  const record = asRecord(body);
  if (!record) return null;

  const rawProfile = record.serviceProfile ?? record.service_profile;
  if (rawProfile === undefined) return null;

  const parsed = ServiceProfileSettingsSchema.safeParse(rawProfile);
  if (!parsed.success) {
    throw parsed.error;
  }

  const rawId = record.serviceProfileId ?? record.service_profile_id;
  const id =
    typeof rawId === "string" && rawId.trim().length > 0 ? rawId.trim() : null;

  return {
    id,
    fields: parsed.data,
  };
}

function serviceProfilePayloads(
  values: ServiceProfileSettingsInput,
): DbRecord[] {
  const normalized = {
    target_audience: normalizeList(values.target_audience),
    core_problem: values.core_problem.trim(),
    unique_value_prop: values.unique_value_prop.trim(),
    use_cases: normalizeList(values.use_cases),
    pain_points: normalizeList(values.pain_points),
    buying_triggers: normalizeList(values.buying_triggers),
    negative_keywords: normalizeList(values.negative_keywords),
    excluded_audiences: normalizeList(values.excluded_audiences),
  };
  const now = new Date().toISOString();
  const document = {
    ...normalized,
    core_problem_solved: normalized.core_problem,
    key_value_propositions: normalized.unique_value_prop
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean),
    ideal_customer_pain_points: normalized.pain_points,
    review_status: "approved",
    status: "approved",
    extraction_status: "manual_refined",
    embedding_status: "pending",
    manually_refined_at: now,
    approved_at: now,
  } satisfies Record<string, Json>;

  const directPayload = {
    ...normalized,
    profile_json: document,
    profile: document,
    data: document,
    status: "approved",
    extraction_status: "manual_refined",
    approved_at: now,
    updated_at: now,
  } satisfies DbRecord;

  return [
    directPayload,
    {
      profile_json: document,
      profile: document,
      data: document,
      status: "approved",
      updated_at: now,
    },
    {
      profile_json: document,
      status: "approved",
      updated_at: now,
    },
    {
      profile: document,
      status: "approved",
      updated_at: now,
    },
    {
      data: document,
      status: "approved",
      updated_at: now,
    },
  ];
}

async function latestServiceProfileId(
  supabase: SupabaseClient<Database>,
  tenantId: string,
) {
  const result = await supabase
    .from("service_profiles")
    .select("id")
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string | null }>();

  if (result.error) {
    console.warn("[SERVICE_PROFILE_SETTINGS_LOOKUP_SKIPPED]", {
      event: "settings_service_profile_lookup_failed",
      tenant_id: tenantId,
      db_error: dbErrorDetails(result.error),
    });
    return null;
  }

  return result.data?.id ?? null;
}

async function clearServiceProfileEmbeddings(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  serviceProfileId: string | null,
) {
  if (!serviceProfileId) return;

  const result = await supabase
    .from("service_profile_embeddings")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("service_profile_id", serviceProfileId);

  if (result.error) {
    console.warn("[SERVICE_PROFILE_EMBEDDINGS_CLEAR_SKIPPED]", {
      event: "settings_service_profile_embeddings_clear_failed",
      tenant_id: tenantId,
      service_profile_id: serviceProfileId,
      db_error: dbErrorDetails(result.error),
    });
  }
}

async function persistServiceProfileUpdate(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  update: ServiceProfileUpdate,
) {
  const resolvedProfileId =
    update.id ?? (await latestServiceProfileId(supabase, tenantId));
  let lastError: PostgrestLikeError | null = null;

  for (const payload of serviceProfilePayloads(update.fields)) {
    const query = resolvedProfileId
      ? supabase
          .from("service_profiles")
          .update(payload)
          .eq("tenant_id", tenantId)
          .eq("id", resolvedProfileId)
      : supabase
          .from("service_profiles")
          .insert({ ...payload, tenant_id: tenantId });

    const result = await query.select("id").maybeSingle<{ id: string | null }>();

    if (!result.error && (result.data || !resolvedProfileId)) {
      const serviceProfileId = result.data?.id ?? resolvedProfileId;
      await clearServiceProfileEmbeddings(supabase, tenantId, serviceProfileId);
      return serviceProfileId ?? null;
    }

    lastError = result.error as PostgrestLikeError | null;
  }

  if (lastError) {
    const classified = classifyDatabaseError(lastError);
    console.error("[SERVICE_PROFILE_SETTINGS_UPDATE_ERROR]", {
      event: "settings_service_profile_update_failed",
      tenant_id: tenantId,
      service_profile_id: resolvedProfileId,
      db_error: dbErrorDetails(lastError),
    });

    return {
      error: classified.error,
      status: classified.status,
      code: classified.code,
      details: dbErrorDetails(lastError),
    };
  }

  return {
    error: "Service profile could not be updated.",
    status: 500,
    code: "service_profile_update_failed",
  };
}

function jsonError(
  error: string,
  status: number,
  code: string,
  details?: unknown
) {
  return NextResponse.json(
    { error, code, ...(details === undefined ? {} : { details }) },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

function dbErrorDetails(error: PostgrestLikeError) {
  return {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  };
}

function classifyDatabaseError(error: PostgrestLikeError) {
  switch (error.code) {
    case "42501":
      return {
        status: 403,
        code: "rls_denied",
        error:
          "Workspace settings update was blocked by database access policy.",
      };
    case "23514":
      return {
        status: 400,
        code: "constraint_violation",
        error:
          "Workspace settings violated a database constraint. Check field formatting and try again.",
      };
    case "23502":
      return {
        status: 400,
        code: "not_null_violation",
        error: "Workspace settings are missing a required database field.",
      };
    case "23503":
      return {
        status: 409,
        code: "foreign_key_violation",
        error:
          "Workspace settings reference a tenant that is not available to this session.",
      };
    case "23505":
      return {
        status: 409,
        code: "unique_violation",
        error:
          "Workspace settings were changed concurrently. Refresh and try again.",
      };
    case "22P02":
      return {
        status: 400,
        code: "invalid_database_value",
        error: "Workspace settings contain a value the database cannot parse.",
      };
    case "PGRST116":
      return {
        status: 404,
        code: "settings_row_not_found",
        error: "Workspace settings record was not found for this tenant.",
      };
    default:
      return {
        status: 500,
        code: "settings_persistence_failed",
        error: "Database failed to persist workspace configuration.",
      };
  }
}

export async function handleWorkspaceUpdate(req: Request) {
  let userId: string | null = null;
  let tenantId: string | null = null;

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError("Invalid JSON payload.", 400, "invalid_json");
    }

    let serviceProfileUpdate: ServiceProfileUpdate | null = null;
    try {
      serviceProfileUpdate = parseServiceProfileUpdate(body);
    } catch (error) {
      if (error instanceof ZodError) {
        return jsonError(
          "Invalid service profile payload.",
          400,
          "service_profile_validation_failed",
          error.flatten()
        );
      }

      throw error;
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.warn("[WORKSPACE_UPDATE_UNAUTHORIZED]", {
        event: "workspace_update_unauthorized",
        auth_error: authError?.message,
      });
      return jsonError("Unauthorized session.", 401, "unauthorized");
    }

    userId = user.id;

    const { data: tenantUser, error: tenantError } = await supabase
      .from("tenant_users")
      .select("tenant_id, user_id, role")
      .eq("user_id", user.id)
      .single<TenantUserMembership>();

    const isMissingMembership =
      Boolean(tenantError && tenantError.code === "PGRST116") ||
      !tenantUser?.tenant_id;

    if (tenantError && !isMissingMembership) {
      console.error("[TENANT_CONTEXT_ERROR]", {
        event: "workspace_update_tenant_lookup_failed",
        user_id: user.id,
        db_error: dbErrorDetails(tenantError),
      });
      return jsonError(
        "Failed to resolve tenant context.",
        500,
        "tenant_resolution_failed",
        dbErrorDetails(tenantError)
      );
    }

    if (isMissingMembership) {
      console.warn("[WORKSPACE_UPDATE_FORBIDDEN]", {
        event: "workspace_update_missing_membership",
        user_id: user.id,
      });
      return jsonError(
        "Forbidden: tenant membership was not resolved.",
        403,
        "tenant_membership_missing"
      );
    }

    if (tenantUser.user_id && String(tenantUser.user_id) !== user.id) {
      console.error("[TENANT_CONTEXT_INTEGRITY_ERROR]", {
        event: "workspace_update_membership_user_mismatch",
        user_id: user.id,
        tenant_user_id: tenantUser.user_id,
        tenant_id: tenantUser.tenant_id,
      });
      return jsonError(
        "Tenant relationship integrity violation.",
        500,
        "tenant_integrity_error"
      );
    }

    tenantId = String(tenantUser.tenant_id);

    const parsed = WorkspaceSettingsSchema.safeParse(body);

    if (!parsed.success) {
      const receivedKeys =
        body && typeof body === "object" && !Array.isArray(body)
          ? Object.keys(body as Record<string, unknown>)
          : typeof body;

      console.warn("[WORKSPACE_UPDATE_VALIDATION_FAILED]", {
        event: "workspace_update_validation_failed",
        user_id: user.id,
        tenant_id: tenantId,
        received_keys: receivedKeys,
        validation: parsed.error.flatten(),
      });

      return jsonError(
        "Invalid configuration payload.",
        400,
        "validation_failed",
        parsed.error.flatten()
      );
    }

    const { companyName, replyToEmail, senderEmail, fullName, websiteUrl } =
      parsed.data;

    const updatePayload: TenantSettingsUpdate = {};
    const appliedSettings: Record<string, string> = {};

    if (companyName !== undefined) {
      updatePayload.company_name = normalizeOptionalString(companyName);
      appliedSettings.companyName = updatePayload.company_name ?? "";
    }

    if (replyToEmail !== undefined) {
      updatePayload.reply_to_email = normalizeOptionalString(replyToEmail);
      appliedSettings.replyToEmail = updatePayload.reply_to_email ?? "";
    }

    if (senderEmail !== undefined) {
      updatePayload.sender_email = normalizeOptionalString(senderEmail);
      appliedSettings.senderEmail = updatePayload.sender_email ?? "";
    }

    if (websiteUrl !== undefined) {
      updatePayload.website_url = normalizeOptionalString(websiteUrl);
      appliedSettings.websiteUrl = updatePayload.website_url ?? "";
    }

    const mutatedFields = Object.keys(updatePayload);
    const hasTenantMutations = mutatedFields.length > 0;
    const role = normalizedRole(tenantUser.role);

    const hasServiceProfileMutations = Boolean(serviceProfileUpdate);

    if (
      (hasTenantMutations || hasServiceProfileMutations) &&
      !WORKSPACE_UPDATE_ROLES.has(role)
    ) {
      console.warn("[WORKSPACE_UPDATE_ROLE_DENIED]", {
        event: "workspace_update_role_denied",
        user_id: user.id,
        tenant_id: tenantId,
        role,
        fields_mutated: mutatedFields,
        service_profile_mutated: hasServiceProfileMutations,
      });
      return jsonError(
        "Only workspace owners or admins can update workspace settings.",
        403,
        "insufficient_workspace_role"
      );
    }

    let profileUpdated = false;

    if (fullName !== undefined) {
      const normalizedIncomingName = normalizeOptionalString(fullName) ?? "";
      const currentStoredName =
        normalizeOptionalString(
          user.user_metadata?.full_name ?? user.user_metadata?.name
        ) ?? "";

      appliedSettings.fullName = normalizedIncomingName;

      if (normalizedIncomingName !== currentStoredName) {
        const { error: authUpdateError } = await supabase.auth.updateUser({
          data: {
            full_name: normalizedIncomingName,
            name: normalizedIncomingName,
          },
        });

        if (authUpdateError) {
          console.error("[USER_PROFILE_UPDATE_ERROR]", {
            event: "user_profile_update_failed",
            user_id: user.id,
            tenant_id: tenantId,
            auth_error: {
              status: authUpdateError.status,
              code: authUpdateError.code,
              message: authUpdateError.message,
            },
          });
          return jsonError(
            `Failed to update personal profile: ${authUpdateError.message}`,
            500,
            "profile_update_failed"
          );
        }

        profileUpdated = true;
      }
    }

    if (!hasTenantMutations && !profileUpdated && !hasServiceProfileMutations) {
      return NextResponse.json(
        {
          success: true,
          message: "No modifications required.",
          settings: appliedSettings,
          metadata: { tenantId },
        },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }

    let updatedTimestamp = new Date().toISOString();

    if (hasTenantMutations) {
      updatePayload.updated_at = updatedTimestamp;

      let updatedSettings = null as {
        tenant_id: string;
        updated_at: string | null;
      } | null;

      const updateResult = await supabase
        .from("tenant_settings")
        .update(updatePayload)
        .eq("tenant_id", tenantId)
        .select(WORKSPACE_SETTINGS_SELECT)
        .single();

      if (updateResult.error?.code === "PGRST116") {
        console.warn("[WORKSPACE_UPDATE_ROW_MISSING]", {
          event: "workspace_update_settings_row_missing",
          user_id: user.id,
          tenant_id: tenantId,
          fields_mutated: mutatedFields,
          db_error: dbErrorDetails(updateResult.error),
        });

        const insertPayload = {
          ...updatePayload,
          tenant_id: tenantId,
        } satisfies TenantSettingsInsert;

        const insertResult = await supabase
          .from("tenant_settings")
          .insert(insertPayload)
          .select(WORKSPACE_SETTINGS_SELECT)
          .single();

        if (insertResult.error?.code === "23505") {
          const retryResult = await supabase
            .from("tenant_settings")
            .update(updatePayload)
            .eq("tenant_id", tenantId)
            .select(WORKSPACE_SETTINGS_SELECT)
            .single();

          if (retryResult.error) {
            const classified = classifyDatabaseError(retryResult.error);
            console.error("[WORKSPACE_UPDATE_RETRY_ERROR]", {
              event: "workspace_update_retry_failed",
              user_id: user.id,
              tenant_id: tenantId,
              fields_mutated: mutatedFields,
              db_error: dbErrorDetails(retryResult.error),
            });
            return jsonError(
              classified.error,
              classified.status,
              classified.code,
              dbErrorDetails(retryResult.error)
            );
          }

          updatedSettings = retryResult.data;
        } else if (insertResult.error) {
          const classified = classifyDatabaseError(insertResult.error);
          console.error("[WORKSPACE_SETTINGS_INSERT_ERROR]", {
            event: "workspace_settings_insert_failed",
            user_id: user.id,
            tenant_id: tenantId,
            fields_mutated: mutatedFields,
            db_error: dbErrorDetails(insertResult.error),
          });
          return jsonError(
            classified.error,
            classified.status,
            classified.code,
            dbErrorDetails(insertResult.error)
          );
        } else {
          updatedSettings = insertResult.data;
        }
      } else if (updateResult.error) {
        const classified = classifyDatabaseError(updateResult.error);
        console.error("[WORKSPACE_UPDATE_ERROR]", {
          event: "workspace_update_failed",
          user_id: user.id,
          tenant_id: tenantId,
          fields_mutated: mutatedFields,
          db_error: dbErrorDetails(updateResult.error),
        });
        return jsonError(
          classified.error,
          classified.status,
          classified.code,
          dbErrorDetails(updateResult.error)
        );
      } else {
        updatedSettings = updateResult.data;
      }

      updatedTimestamp = updatedSettings?.updated_at ?? updatedTimestamp;
    }

    let serviceProfileUpdated = false;
    let serviceProfileId: string | null = null;

    if (serviceProfileUpdate) {
      const result = await persistServiceProfileUpdate(
        supabase,
        tenantId,
        serviceProfileUpdate
      );

      if (typeof result === "object" && result && "error" in result) {
        return jsonError(
          result.error,
          result.status,
          result.code,
          "details" in result ? result.details : undefined
        );
      }

      serviceProfileUpdated = true;
      serviceProfileId = result;
      updatedTimestamp = new Date().toISOString();
    }

    console.info("[WORKSPACE_UPDATED]", {
      event: "workspace_update_succeeded",
      tenant_id: tenantId,
      user_id: user.id,
      profile_updated: profileUpdated,
      service_profile_updated: serviceProfileUpdated,
      service_profile_id: serviceProfileId,
      fields_mutated: mutatedFields,
      timestamp: updatedTimestamp,
    });

    revalidatePath("/settings");
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/settings");

    return NextResponse.json(
      {
        success: true,
        message: "Configuration updated successfully.",
        settings: appliedSettings,
        metadata: {
          tenantId,
          updatedAt: updatedTimestamp,
          serviceProfileUpdated,
          serviceProfileId,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const stack = error instanceof Error ? error.stack : undefined;

    console.error("[WORKSPACE_API_FATAL]", {
      event: "workspace_update_fatal",
      user_id: userId,
      tenant_id: tenantId,
      message,
      stack,
    });

    return jsonError(
      "Internal server error during workspace synchronization.",
      500,
      "workspace_update_fatal"
    );
  }
}
