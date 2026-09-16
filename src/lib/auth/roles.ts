/**
 * Roles are ranked: each one can do everything the roles below it can.
 *   viewer — reads the dashboard pages their user type allows
 *   editor — also uploads data and corrects the lookup tables (organization types, outlets)
 *   admin  — also manages users, user types, public pages, integrations and syncs, and sees every page
 *
 * Which pages a non-admin sees is the user type's business, not the role's (src/lib/pages.ts).
 */
export const ROLES = ["viewer", "editor", "admin"] as const;
export type Role = (typeof ROLES)[number];

const RANK: Record<Role, number> = { viewer: 0, editor: 1, admin: 2 };

export const ROLE_LABELS: Record<Role, string> = {
  viewer: "צופה",
  editor: "עורך נתונים",
  admin: "אדמין",
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function hasRole(actual: Role, minimum: Role): boolean {
  return RANK[actual] >= RANK[minimum];
}
