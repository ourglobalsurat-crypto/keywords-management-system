import { sql } from "./db";
import type { SessionUser } from "./auth";
import type { Action } from "./constants";

// Append a row to the activity log. Every mutating action funnels through
// here so the log always records WHO (name + role) did WHAT.
export async function logActivity(params: {
  actor: SessionUser;
  action: Action;
  entityType: string;
  entityId?: number | null;
  keywordText?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  const {
    actor,
    action,
    entityType,
    entityId = null,
    keywordText = "",
    details = {},
  } = params;
  await sql`
    INSERT INTO activity_log
      (actor_name, actor_role, action, entity_type, entity_id, keyword_text, details)
    VALUES (
      ${actor.name}, ${actor.role}, ${action}, ${entityType},
      ${entityId}, ${keywordText}, ${sql.json(details as Record<string, never>)}
    )
  `;
}
