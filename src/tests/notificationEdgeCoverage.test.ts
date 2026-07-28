import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  NOTIFICATION_EDGE_REGISTRY,
  isRegisteredNotificationType,
} from "@/lib/notifications/edgeRegistry";

// ADR-189 / POLICY §108g.
// A security tightening of can_send_notification_to silently broke observation
// replies because no contract linked notification producers to guard edges.
// This test is that contract.

const SRC = join(process.cwd(), "src");
const MIG_DIR = join(process.cwd(), "supabase", "migrations");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full) && !full.includes(`${"/"}tests${"/"}`)) out.push(full);
  }
  return out;
}

/** Types emitted within a notifications insert payload. */
function producedTypes(): Map<string, string> {
  const found = new Map<string, string>();
  for (const file of walk(SRC)) {
    const body = readFileSync(file, "utf8");
    if (!body.includes("from('notifications')") && !body.includes('from("notifications")')) continue;
    const lines = body.split("\n");
    lines.forEach((line, i) => {
      const m = line.match(/type:\s*['"]([a-z0-9_]+)['"]/);
      if (!m) return;
      // Only count `type:` literals that sit inside a block that also mentions
      // user_id — the discriminating field of a notifications row.
      const window = lines.slice(Math.max(0, i - 6), i + 8).join("\n");
      if (/user_id:/.test(window)) found.set(m[1], file);
    });
  }
  return found;
}

function latestMigrationDefining(fnName: string): string {
  const files = readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).sort();
  for (let i = files.length - 1; i >= 0; i--) {
    const body = readFileSync(join(MIG_DIR, files[i]), "utf8");
    if (new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${fnName}\\s*\\(`, "i").test(body)) {
      return body;
    }
  }
  throw new Error(`No migration defines ${fnName}`);
}

describe("notification edge coverage (ADR-189)", () => {
  const produced = producedTypes();

  it("finds at least the observation mention producer", () => {
    expect(produced.has("observation_mention")).toBe(true);
  });

  it("every produced notification type declares an authorising edge", () => {
    const unregistered = [...produced.entries()]
      .filter(([type]) => !isRegisteredNotificationType(type))
      .map(([type, file]) => `${type} (${file})`);
    expect(unregistered).toEqual([]);
  });

  it("every registered type declares at least one edge", () => {
    for (const [type, spec] of Object.entries(NOTIFICATION_EDGE_REGISTRY)) {
      expect(spec.edges.length, `${type} has no edges`).toBeGreaterThan(0);
    }
  });

  it("observation notifications are authorised by thread participation", () => {
    const spec = NOTIFICATION_EDGE_REGISTRY.observation_mention;
    expect(spec.edges).toContain("observation_participant");
    expect(spec.requiresObservationContext).toBe(true);
  });

  it("the observation_participant edge exists in the deployed guard", () => {
    const body = latestMigrationDefining("can_send_notification_to");
    expect(body).toMatch(/is_observation_participant/);
    expect(body).toMatch(/observation_id/);
  });

  it("the notification trigger passes thread context to the guard", () => {
    const body = latestMigrationDefining("tg_notifications_enforce_sender_relationship");
    expect(body).toMatch(/can_send_notification_to\(\s*v_caller,\s*NEW\.user_id,\s*NEW\.metadata\s*\)/);
  });
});
