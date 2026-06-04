// Edge function: manage-implementer
// Platform-owner-gated CRUD for `implementation_admin` role and
// per-client assignments. Writes immutable rows to entitlement_audit.
//
// Actions (POST body { action, target_user_id, client_id?, reason? }):
//   - grant_role        → insert into user_roles (implementation_admin)
//   - revoke_role       → delete user_roles row + all client assignments
//   - assign_client     → insert into client_implementer_assignments
//   - unassign_client   → delete one client_implementer_assignments row
//
// Safety rules enforced server-side:
//   - Caller MUST have platform_owner role (verified via service-role query).
//   - PMS roles (admin/manager/employee/etc.) are NEVER touched.
//   - implementation_admin grant is additive (ON CONFLICT no-op).
//   - Self-revoke of platform_owner role is impossible (this function only
//     manipulates implementation_admin), but we still refuse revoke_role
//     when target == caller as a belt-and-braces guard against locking
//     yourself out of the console.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function decodeSub(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const norm = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = norm + '='.repeat((4 - (norm.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, 401);
    }
    const token = authHeader.slice('Bearer '.length).trim();
    const callerId = decodeSub(token);
    if (!callerId) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Step 1: confirm caller has platform_owner role
    const { data: ownerRow, error: ownerErr } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', callerId)
      .eq('role', 'platform_owner')
      .maybeSingle();
    if (ownerErr) return json({ error: ownerErr.message }, 500);
    if (!ownerRow) return json({ error: 'Platform owner access required' }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? '');
    const targetUserId = body?.target_user_id as string | undefined;
    const clientId = (body?.client_id as string | undefined) ?? null;
    const reason = (body?.reason as string | undefined) ?? null;

    if (!targetUserId) return json({ error: 'target_user_id is required' }, 400);

    // Step 2: look up target profile (used in audit + sanity checks)
    const { data: targetProfile, error: pErr } = await admin
      .from('profiles')
      .select('id, email, full_name, employee_code, is_active')
      .eq('id', targetUserId)
      .maybeSingle();
    if (pErr) return json({ error: pErr.message }, 500);
    if (!targetProfile) return json({ error: 'Target user not found' }, 404);

    const targetKey = targetProfile.employee_code || targetProfile.id;

    async function writeAudit(opts: {
      eventType: 'grant' | 'revoke' | 'update';
      entityType: string;
      entityKey: string;
      before: unknown;
      after: unknown;
      reasonCode: string;
      clientIdForRow: string | null;
    }) {
      await admin.from('entitlement_audit').insert({
        actor_id: callerId,
        event_type: opts.eventType,
        entity_type: opts.entityType,
        entity_key: opts.entityKey,
        client_id: opts.clientIdForRow,
        before: opts.before as never,
        after: opts.after as never,
        reason: opts.reasonCode + (reason ? `: ${reason}` : ''),
      });
    }

    switch (action) {
      case 'grant_role': {
        // Additive: upsert via insert with on-conflict-do-nothing semantics.
        const { data: existing } = await admin
          .from('user_roles')
          .select('id')
          .eq('user_id', targetUserId)
          .eq('role', 'implementation_admin')
          .maybeSingle();
        if (existing) {
          return json({ ok: true, status: 'already_granted' });
        }
        const { error: insErr } = await admin
          .from('user_roles')
          .insert({ user_id: targetUserId, role: 'implementation_admin' });
        if (insErr) return json({ error: insErr.message }, 500);
        await writeAudit({
          eventType: 'grant',
          entityType: 'implementation_admin_role',
          entityKey: targetKey,
          before: {},
          after: { user_id: targetUserId, role: 'implementation_admin', email: targetProfile.email },
          reasonCode: 'impl_console_grant_role',
          clientIdForRow: null,
        });
        return json({ ok: true, status: 'granted' });
      }

      case 'revoke_role': {
        if (targetUserId === callerId) {
          return json({ error: 'You cannot revoke your own implementation_admin role from this screen.' }, 400);
        }
        // Snapshot assignments before delete (for audit).
        const { data: assignments } = await admin
          .from('client_implementer_assignments')
          .select('id, client_id')
          .eq('user_id', targetUserId);

        // Delete all assignments first, then the role row.
        const { error: dAErr } = await admin
          .from('client_implementer_assignments')
          .delete()
          .eq('user_id', targetUserId);
        if (dAErr) return json({ error: dAErr.message }, 500);

        const { error: dRErr } = await admin
          .from('user_roles')
          .delete()
          .eq('user_id', targetUserId)
          .eq('role', 'implementation_admin');
        if (dRErr) return json({ error: dRErr.message }, 500);

        await writeAudit({
          eventType: 'revoke',
          entityType: 'implementation_admin_role',
          entityKey: targetKey,
          before: { user_id: targetUserId, role: 'implementation_admin', assignments: assignments ?? [] },
          after: {},
          reasonCode: 'impl_console_revoke_role',
          clientIdForRow: null,
        });
        return json({ ok: true, status: 'revoked', cleared_assignments: assignments?.length ?? 0 });
      }

      case 'assign_client': {
        if (!clientId) return json({ error: 'client_id is required' }, 400);
        // Confirm target has the role (assignments without role are inert).
        const { data: roleRow } = await admin
          .from('user_roles')
          .select('id')
          .eq('user_id', targetUserId)
          .eq('role', 'implementation_admin')
          .maybeSingle();
        if (!roleRow) {
          return json({ error: 'Target user does not have implementation_admin role. Grant the role first.' }, 409);
        }
        const { data: client } = await admin
          .from('clients')
          .select('id, client_key, display_name')
          .eq('id', clientId)
          .maybeSingle();
        if (!client) return json({ error: 'Client not found' }, 404);

        const { error: insErr } = await admin
          .from('client_implementer_assignments')
          .insert({ client_id: clientId, user_id: targetUserId, assigned_by: callerId });
        if (insErr) {
          if (/duplicate key|unique/i.test(insErr.message)) {
            return json({ ok: true, status: 'already_assigned' });
          }
          return json({ error: insErr.message }, 500);
        }
        await writeAudit({
          eventType: 'grant',
          entityType: 'client_implementer_assignment',
          entityKey: `${client.client_key}:${targetKey}`,
          before: {},
          after: { client_id: clientId, user_id: targetUserId, email: targetProfile.email },
          reasonCode: 'impl_console_assign_client',
          clientIdForRow: clientId,
        });
        return json({ ok: true, status: 'assigned' });
      }

      case 'unassign_client': {
        if (!clientId) return json({ error: 'client_id is required' }, 400);
        const { data: client } = await admin
          .from('clients')
          .select('id, client_key')
          .eq('id', clientId)
          .maybeSingle();
        const { error: dErr } = await admin
          .from('client_implementer_assignments')
          .delete()
          .eq('user_id', targetUserId)
          .eq('client_id', clientId);
        if (dErr) return json({ error: dErr.message }, 500);
        await writeAudit({
          eventType: 'revoke',
          entityType: 'client_implementer_assignment',
          entityKey: `${client?.client_key ?? clientId}:${targetKey}`,
          before: { client_id: clientId, user_id: targetUserId },
          after: {},
          reasonCode: 'impl_console_unassign_client',
          clientIdForRow: clientId,
        });
        return json({ ok: true, status: 'unassigned' });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});