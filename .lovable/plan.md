## Root Cause

The latest rollout logs show a different error than before:

- Password generation is succeeding (`status: success`).
- Email delivery is failing because the internal call now sends two different API key formats:
  - `Authorization: Bearer <service role key>`
  - `apikey: <publishable/anon key>`
- Lovable Cloud rejects this as **“Conflicting API keys”** before `send-email-notification` can process the request.

## Risk & Impact Report

- **Data Impact:** No schema, RLS, or historical KPI data changes.
- **Workflow Impact:** Only affects internal password rollout email delivery; password generation remains unchanged.
- **UI/UX Consistency:** No UI layout changes.
- **Regression Risk:** Medium, because edge-to-edge email dispatch is used in multiple functions and mixed auth headers can break delivery.
- **Mitigation Plan:** Centralize the password rollout email dispatch header behavior and add a regression test that prevents sending conflicting key types again.

## Implementation Plan

1. **Fix `password-rollout` email dispatch**
   - Replace the mixed `Authorization: serviceRoleKey` + `apikey: anonKey` request.
   - Use a single consistent internal auth pattern that Lovable Cloud accepts.
   - The safest immediate fix is to send the stored publishable key as both `Authorization` and `apikey`, matching the path already accepted by `send-email-notification` logs: “Authorized via Bearer matching system_settings stored key”.

2. **Preserve existing rollout behavior**
   - Keep password generation, auth user provisioning, synthetic-email skipping, audit logging, and result payloads unchanged.
   - Only change the nested email dispatch call.

3. **Add regression coverage**
   - Add or extend a unit test around the password rollout dispatch helper/code path to assert it does not send conflicting key types.
   - The test should verify both headers use the same intended key when invoking `send-email-notification`.

4. **Documentation / policy sync**
   - Update the relevant internal policy/memory note for edge-to-edge function calls: never mix legacy service-role placeholders with publishable/anon keys in the same request.
   - Add a short changelog/doc entry for this rollout email fix.

5. **Deploy and validate**
   - Deploy `password-rollout`.
   - Check fresh edge function logs after another test send to confirm the error changes from “Conflicting API keys” to success, or surfaces the next provider-level issue if email provider config is invalid.