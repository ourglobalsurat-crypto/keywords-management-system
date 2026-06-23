import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  verifyCredentials,
  signSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { logActivity } from "@/lib/audit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let username = "";
  let password = "";
  try {
    const body = await req.json();
    username = String(body.username ?? "");
    password = String(body.password ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const user = verifyCredentials(username, password);
  if (!user) {
    return NextResponse.json(
      { error: "Incorrect username or password." },
      { status: 401 }
    );
  }

  const token = await signSession(user);
  cookies().set(SESSION_COOKIE, token, sessionCookieOptions);

  // Best-effort login log (don't block sign-in if DB is momentarily down).
  try {
    await ensureSchema();
    await logActivity({ actor: user, action: "login", entityType: "session" });
  } catch {
    /* ignore */
  }

  return NextResponse.json({ user });
}
