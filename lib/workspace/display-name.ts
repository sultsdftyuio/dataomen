/** Hide the email-provider name assigned to older personal-email workspaces. */
export function workspaceDisplayName(name: string | null | undefined): string {
  const value = name?.trim();
  return !value || /^gmail workspace$/i.test(value) ? "Workspace" : value;
}
