import { cookies } from "next/headers";
import type { Role } from "./roles";

/**
 * "View as": an admin can see the platform as a lower role, or as a user type
 * (a board member, a journalist…) to check exactly which pages they get. The
 * choice lives in a cookie and is honoured only for users whose stored role is
 * admin — for anyone else it is ignored, so a forged cookie can never raise access.
 *
 * Cookie values: "editor", "viewer", or "type:<user type key>" (a viewer of that type).
 */

export const PREVIEW_COOKIE = "meida_view_as";

export const PREVIEW_ROLES = ["editor", "viewer"] as const satisfies readonly Role[];
export type PreviewRole = (typeof PREVIEW_ROLES)[number];

export type Preview = { role: PreviewRole; userType: string | null };

const TYPE_KEY = /^[a-z0-9-]{1,40}$/;

export function parsePreview(value: unknown): Preview | null {
  if (typeof value !== "string") return null;
  if ((PREVIEW_ROLES as readonly string[]).includes(value)) return { role: value as PreviewRole, userType: null };
  const key = value.startsWith("type:") ? value.slice(5) : null;
  return key && TYPE_KEY.test(key) ? { role: "viewer", userType: key } : null;
}

export async function readPreview(): Promise<Preview | null> {
  return parsePreview((await cookies()).get(PREVIEW_COOKIE)?.value);
}
