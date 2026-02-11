

# Add Password Rollout Email Template

## Problem
The `password_rollout` event type was registered in the notification settings and edge function, but no corresponding template was added to the Email Template Editor (`src/components/admin/EmailTemplateEditor.tsx`). This means admins cannot customize the password rollout email content.

## Changes

### 1. `src/components/admin/EmailTemplateEditor.tsx`

**Add new template to `DEFAULT_TEMPLATES` array** (after the last entry, `observation_resolved`):

```typescript
{
  key: 'password_rollout',
  label: 'Password Rollout',
  description: 'Sent to users when admin generates login credentials',
  subject: '[PMS] Your Login Credentials',
  bodyTemplate: `Hi {{recipient_name}},

Your login credentials for the Performance Management System have been created.

Email: {{login_email}}
Password: {{generated_password}}

Please log in and change your password as soon as possible.

Login URL: {{login_url}}`,
  color: '#6366f1',
  emoji: '🔑',
}
```

**Add new placeholders to `PLACEHOLDERS` array**:

```typescript
{ key: '{{generated_password}}', description: 'Generated password (password rollout only)' },
{ key: '{{login_email}}', description: 'User login email (password rollout only)' },
{ key: '{{login_url}}', description: 'Application login URL (password rollout only)' },
```

### 2. `DOCUMENTATION.md`

Update the email template documentation to reflect 22 templates matching the 22 event types.

