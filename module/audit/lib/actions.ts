export const AUDIT_ACTIONS = [
  "repository.connected",
  "repository.disconnected",
  "rules.updated",
  "workspace.created",
  "workspace.deleted",
  "workspace.member_added",
  "workspace.member_removed",
  "workspace.role_changed",
  "workspace.repository_shared",
  "workspace.repository_unshared",
  "apikey.created",
  "apikey.revoked",
  "channel.added",
  "channel.removed",
  "subscription.activated",
  "subscription.changed_by_admin",
  "finding.autofix_applied",
  "installation.linked",
  "installation.removed",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
