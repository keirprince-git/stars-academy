import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "crypto";
import { getUserByUsername, createSession, getSessionByToken, deleteSession } from "./db";

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

export async function requireAuth(requiredRole?: "admin" | "recorder") {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) redirect("/login");

  const session = getSessionByToken(token);
  if (!session) {
    // Can't delete cookies in a Server Component — just redirect.
    // The middleware will handle the stale cookie on next request.
    redirect("/login");
  }

  if (requiredRole === "admin" && session.role !== "admin") {
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
