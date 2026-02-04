

# Plan: Add Custom SMTP Server Configuration for System Emails

## Overview

This plan adds the ability to choose between **Resend API** (current) or **Custom SMTP** for sending system emails. Administrators can configure their organization's official mail server (like BFCL's mail service) as the email provider.

---

## Current State

| Component | Status |
|-----------|--------|
| Email Provider | Resend only (hardcoded) |
| Settings Storage | `system_settings` table |
| Edge Function | `send-email-notification/index.ts` |
| UI Component | `EmailNotificationSettings.tsx` |
| Settings Hook | `useEmailNotificationSettings.ts` |

---

## Proposed Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                    Email Notification Settings                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Email Provider                                                 │
│  ○ Resend (Default)    ● Custom SMTP                           │
│                                                                 │
│  ┌─ SMTP Configuration ──────────────────────────────────────┐  │
│  │                                                           │  │
│  │  SMTP Host             [ mail.bfcl.com              ]     │  │
│  │  Port                  [ 587 ] ▼ (465/587/25)             │  │
│  │  Security              ○ TLS  ○ STARTTLS  ○ None          │  │
│  │                                                           │  │
│  │  Username              [ noreply@bfcl.com           ]     │  │
│  │  Password              [ ●●●●●●●●●●●●●●●●           ]     │  │
│  │                                                           │  │
│  │  From Address          [ noreply@bfcl.com           ]     │  │
│  │  From Name             [ BFCL PMS System            ]     │  │
│  │                                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  [ Test Connection ]                                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Database Changes

### New System Settings Keys

```sql
INSERT INTO system_settings (setting_key, setting_value, description) VALUES
  ('email_provider', '"resend"', 'Email provider: resend or smtp'),
  ('smtp_host', '""', 'SMTP server hostname'),
  ('smtp_port', '587', 'SMTP server port'),
  ('smtp_security', '"tls"', 'SMTP security: tls, starttls, or none'),
  ('smtp_username', '""', 'SMTP authentication username'),
  ('smtp_from_address', '""', 'SMTP from email address'),
  ('smtp_from_name', '""', 'SMTP from display name')
ON CONFLICT (setting_key) DO NOTHING;
```

### New Secret for SMTP Password

The SMTP password will be stored as a Lovable Cloud secret (`SMTP_PASSWORD`) to avoid storing credentials in the database.

---

## Edge Function Updates

### Modified: `send-email-notification/index.ts`

Add SMTP sending capability using `nodemailer` compatible library for Deno:

```typescript
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

// Determine which provider to use
const provider = settingsMap.email_provider || 'resend';

if (provider === 'smtp') {
  // Use custom SMTP
  const client = new SMTPClient({
    connection: {
      hostname: smtpHost,
      port: parseInt(smtpPort),
      tls: smtpSecurity === 'tls',
      auth: {
        username: smtpUsername,
        password: Deno.env.get('SMTP_PASSWORD'),
      },
    },
  });
  
  await client.send({
    from: `${senderName} <${senderEmail}>`,
    to: recipient_email,
    subject: subject,
    html: html,
  });
  
  await client.close();
} else {
  // Use Resend (existing code)
  await resend.emails.send({...});
}
```

---

## UI Changes

### Updated: `EmailNotificationSettings.tsx`

1. **Provider Selection**: Radio group to choose between Resend and Custom SMTP
2. **Conditional SMTP Form**: Show SMTP configuration fields only when SMTP is selected
3. **SMTP Fields**:
   - Host (text input)
   - Port (dropdown: 25, 465, 587)
   - Security (radio: TLS, STARTTLS, None)
   - Username (text input)
   - Password (password input with visibility toggle)
   - From Address (email input)
   - From Name (text input)
4. **Test Connection Button**: Verify SMTP settings before saving

---

## Hook Updates

### Updated: `useEmailNotificationSettings.ts`

Extended interface and settings management:

```typescript
export interface EmailNotificationSettings {
  // Existing fields...
  enabled: boolean;
  senderName: string;
  senderEmail: string;
  enabledEvents: EmailEventType[];
  companyLogoUrl: string;
  customFooterText: string;
  
  // New SMTP fields
  emailProvider: 'resend' | 'smtp';
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: 'tls' | 'starttls' | 'none';
  smtpUsername: string;
  smtpPassword: string;  // Only for UI state, saved as secret
  smtpFromAddress: string;
  smtpFromName: string;
}
```

---

## Security Considerations

| Concern | Solution |
|---------|----------|
| SMTP Password Storage | Stored as Lovable Cloud secret, not in database |
| Password Display | Masked in UI, only shown when editing |
| Connection Testing | Test button validates before saving |
| Fallback | If SMTP fails, error is logged (no silent fallback) |

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/send-email-notification/index.ts` | Add SMTP sending logic with provider switch |
| `src/components/admin/EmailNotificationSettings.tsx` | Add provider selection and SMTP configuration UI |
| `src/hooks/useEmailNotificationSettings.ts` | Extend settings interface with SMTP fields |
| `DOCUMENTATION.md` | Document SMTP configuration options |

### New Secret to Add
- `SMTP_PASSWORD` - SMTP server authentication password

---

## Implementation Order

1. **Phase 1 - Database**
   - Add new system_settings rows for SMTP configuration
   - Request SMTP_PASSWORD secret from admin

2. **Phase 2 - Edge Function**
   - Add denomailer import
   - Implement provider switching logic
   - Add SMTP connection and send logic
   - Add test connection endpoint

3. **Phase 3 - Frontend**
   - Extend hook with SMTP settings
   - Add provider radio selection
   - Add conditional SMTP configuration form
   - Add test connection button
   - Update save mutation to handle SMTP settings

4. **Phase 4 - Documentation**
   - Update DOCUMENTATION.md with SMTP setup guide

---

## Example SMTP Configuration for BFCL

Once implemented, you would configure:

| Setting | Example Value |
|---------|---------------|
| Provider | Custom SMTP |
| Host | mail.bfcl.com (or your mail server) |
| Port | 587 |
| Security | TLS |
| Username | noreply@bfcl.com |
| Password | (your SMTP password) |
| From Address | noreply@bfcl.com |
| From Name | BFCL PMS System |

---

## Testing Checklist

- [ ] Toggle between Resend and SMTP providers
- [ ] Enter SMTP configuration details
- [ ] Click "Test Connection" to verify SMTP settings
- [ ] Send a test email via SMTP
- [ ] Verify emails are sent with correct From address
- [ ] Verify password is stored securely as secret
- [ ] Verify fallback to Resend still works
- [ ] Check email formatting is consistent across providers

