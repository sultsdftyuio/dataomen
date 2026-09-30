export async function updateResultEmailPreference(enabled: boolean): Promise<boolean> {
  const response = await fetch("/api/settings/crawl-notifications", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ enabled }),
  });
  const payload = (await response.json().catch(() => null)) as {
    enabled?: unknown;
    error?: unknown;
  } | null;

  if (!response.ok || payload?.enabled !== enabled) {
    throw new Error(
      typeof payload?.error === "string"
        ? payload.error
        : "Could not save your result email preference.",
    );
  }

  return enabled;
}
