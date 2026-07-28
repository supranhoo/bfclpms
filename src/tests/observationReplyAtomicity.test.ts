import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// ADR-189 / POLICY §OBS-REPLY-ATOMICITY.
// The reply, acknowledgement, mention notifications and mention access must be
// one server-side transaction, and a notification permission failure must not
// abort the reply.

const MIG_DIR = join(process.cwd(), "supabase", "migrations");
const HOOK = join(process.cwd(), "src", "hooks", "useObservationReplies.ts");
const OBS_HOOK = join(process.cwd(), "src", "hooks", "useKpiObservations.ts");

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

describe("observation reply atomicity", () => {
  const rpc = latestMigrationDefining("post_observation_reply");

  it("performs the reply, acknowledgement, notification and access grant server-side", () => {
    expect(rpc).toMatch(/INSERT INTO public\.kpi_observation_replies/);
    expect(rpc).toMatch(/UPDATE public\.kpi_observations/);
    expect(rpc).toMatch(/INSERT INTO public\.notifications/);
    expect(rpc).toMatch(/INSERT INTO public\.kpi_mention_access/);
  });

  it("degrades gracefully when a notification is not authorised", () => {
    expect(rpc).toMatch(/EXCEPTION/);
    expect(rpc).toMatch(/insufficient_privilege/);
    expect(rpc).toMatch(/v_skipped/);
  });

  it("grants mention access before inserting the notification", () => {
    const access = rpc.indexOf("INSERT INTO public.kpi_mention_access");
    const notify = rpc.indexOf("INSERT INTO public.notifications");
    expect(access).toBeGreaterThan(-1);
    expect(notify).toBeGreaterThan(-1);
    expect(access).toBeLessThan(notify);
  });

  it("runs under the caller's RLS, not as a privilege bypass", () => {
    expect(rpc).toMatch(/SECURITY INVOKER/);
  });

  it("the client posts replies through the single RPC", () => {
    const hook = readFileSync(HOOK, "utf8");
    expect(hook).toMatch(/rpc\('post_observation_reply'/);
    expect(hook).not.toMatch(/from\('kpi_observation_replies'\)\s*\n?\s*\.insert/);
  });

  it("observation creation grants mention access before notifying", () => {
    const body = readFileSync(OBS_HOOK, "utf8");
    const access = body.indexOf("from('kpi_mention_access')");
    const notify = body.indexOf("from('notifications').insert");
    expect(access).toBeGreaterThan(-1);
    expect(notify).toBeGreaterThan(-1);
    expect(access).toBeLessThan(notify);
  });
});
