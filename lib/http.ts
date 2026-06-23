import { NextResponse } from "next/server";
import { UnauthorizedError } from "./auth";

// Uniform error → HTTP response mapping for API route handlers.
export function jsonError(e: unknown): NextResponse {
  if (e instanceof UnauthorizedError) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const message = e instanceof Error ? e.message : "Unexpected server error";
  // Surface a clearer hint when the DB isn't configured yet.
  const status = message.includes("DATABASE_URL") ? 503 : 500;
  return NextResponse.json({ error: message }, { status });
}
