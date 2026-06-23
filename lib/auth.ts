import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import type { Role } from "./constants";

export const SESSION_COOKIE = "kms_session";
const SESSION_DAYS = 30;

export type SessionUser = {
  name: string;
  role: Role;
};

function secretKey(): Uint8Array {
  const secret =
    process.env.SESSION_SECRET || "dev-only-insecure-secret-change-me";
  return new TextEncoder().encode(secret);
}

// ── Account configuration ──
// Credentials come from env vars; if unset we fall back to the agreed
// defaults so the app works out of the box on first deploy.
function accounts(): Array<SessionUser & { password: string }> {
  return [
    {
      name: process.env.CLIENT_USERNAME || "Khushan",
      password: process.env.CLIENT_PASSWORD || "Khushan@007",
      role: "client",
    },
    {
      name: process.env.AGENCY_USERNAME || "Global Surat",
      password: process.env.AGENCY_PASSWORD || "GlobalSurat@007",
      role: "agency",
    },
  ];
}

// Constant-time-ish comparison to avoid trivially leaking length/timing.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function verifyCredentials(
  username: string,
  password: string
): SessionUser | null {
  const u = (username ?? "").trim();
  for (const acc of accounts()) {
    if (
      safeEqual(u.toLowerCase(), acc.name.toLowerCase()) &&
      safeEqual(password ?? "", acc.password)
    ) {
      return { name: acc.name, role: acc.role };
    }
  }
  return null;
}

export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({ name: user.name, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());
}

export async function verifySession(
  token: string | undefined
): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (
      typeof payload.name === "string" &&
      (payload.role === "client" || payload.role === "agency")
    ) {
      return { name: payload.name, role: payload.role };
    }
  } catch {
    // invalid / expired
  }
  return null;
}

// Read the current session inside server components / route handlers.
export async function getSession(): Promise<SessionUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  return verifySession(token);
}

// Use at the top of API route handlers. Throws a typed marker when missing.
export async function requireSession(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) throw new UnauthorizedError();
  return user;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_DAYS * 24 * 60 * 60,
};
