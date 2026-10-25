import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "crypto";
import { getUserByUsername, createSession, getSessionByToken, deleteSession } from "./db";
import type { Role } from "./types";

const COOKIE_NAME = "stars_session";
const SESSION_DAYS = 7;

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  const check = crypto.scryptSync(password, salt, 64).toString("hex");
  return hash === check;
}

/* ── Session management ─────────────────────────────── */

export async function login(username: string, password: string): Promise<string | null> {
  const user = getUserByUsername(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return "Invalid username or password.";
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  createSession(user.id, token, expires);

  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });

  return null; // success
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (token) {
    deleteSession(token);
    jar.delete(COOKIE_NAME);
  }
}

const ROLE_RANK: Record<Role, number> = { recorder: 0, coach: 1, admin: 2 };

/** True if `role` is at least `min` (recorder < coach < admin). */
export function hasRole(role: Role, min: Role): boolean {
  return (ROLE_RANK[role] ?? -1) >= ROLE_RANK[min];
}

/**
 * Require a signed-in user; if `requiredRole` is given, the user must be at
 * least that role (e.g. "coach" admits coaches and admins).
 */
export async function requireAuth(requiredRole?: Role) {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) redirect("/login");

  const session = getSessionByToken(token);
  if (!session) {
    // Can't delete cookies in a Server Component — just redirect.
    // The middleware will handle the stale cookie on next request.
    redirect("/login");
  }

  if (requiredRole && !hasRole(session.role, requiredRole)) {
    redirect("/dashboard?error=forbidden");
  }

  return { userId: session.user_id, username: session.username, role: session.role };
}

export async function getOptionalAuth() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const session = getSessionByToken(token);
  if (!session) return null;

  return { userId: session.user_id, username: session.username, role: session.role };
}
