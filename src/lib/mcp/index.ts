import { auth, defineMcp } from "@lovable.dev/mcp-js";
import whoamiTool from "./tools/whoami";

// OAuth issuer MUST be the direct Supabase host (project-ref.supabase.co),
// derived from a Vite-inlined literal so this entry stays import-safe.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "bfcl-pms-mcp",
  title: "BFCL PMS",
  version: "0.1.0",
  instructions:
    "Tools for the BFCL Performance Management System. Use `whoami` to verify the connection and identify the signed-in user.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [whoamiTool],
});