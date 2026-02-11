

# Enhanced Email Template: Logo Position and Clickable URLs

## Before (Current)

```text
+------------------------------------------+
|        [LOGO centered]                   |
|        [Emoji] [Event Title]             |
|           (colored header)               |
+------------------------------------------+
|                                          |
|  Hi John,                                |
|                                          |
|  Your credentials have been created.     |
|                                          |
|  Login URL: https://pms.bfclalloys.com   |
|             ^^^^ plain text, NOT clickable|
|                                          |
+------------------------------------------+
|  Automated notification footer           |
+------------------------------------------+
```

- Logo is centered above the title
- Logo comes from a separate "Email Company Logo" field (not the Global Branding app logo)
- URLs in email body are plain text -- recipients cannot click them

---

## After (New)

```text
+------------------------------------------+
|  [Emoji] [Event Title]       [LOGO]      |
|   (left-aligned)          (top-right)    |
|           (colored header)               |
+------------------------------------------+
|                                          |
|  Hi John,                                |
|                                          |
|  Your credentials have been created.     |
|                                          |
|  Login URL: https://pms.bfclalloys.com   |
|             ^^^^ blue, underlined LINK   |
|                                          |
+------------------------------------------+
|  Automated notification footer           |
+------------------------------------------+
```

- Logo moves to the **top-right corner** of the header
- Event emoji and title are **left-aligned**
- Logo is automatically pulled from **Global Branding's App Logo** (`app_settings.logo_url`); falls back to the email-specific logo if set
- ALL URLs in ALL templates (existing and future) are automatically converted to **clickable blue hyperlinks**

---

## Technical Changes

### 1. `supabase/functions/send-email-notification/index.ts`

**a) Fetch the Global Branding logo from `app_settings`** (around lines 730-750, where settings are loaded for real notifications):

Add a query to `app_settings` to get `logo_url`. Use it as the primary logo source, falling back to `email_company_logo_url`.

**b) Update `buildEmailHtml` header layout** (lines 413-441):

Change the header from centered layout to a flex/table layout with title on the left and logo on the right:

```html
<!-- Current centered header -->
<div class="header">
  <img src="..." />           <!-- centered -->
  <h1>Emoji Title</h1>        <!-- centered -->
</div>

<!-- New: left title + right logo -->
<div class="header">
  <table width="100%">
    <tr>
      <td style="text-align:left">
        <h1>Emoji Title</h1>
      </td>
      <td style="text-align:right">
        <img src="..." max-height="50px" />
      </td>
    </tr>
  </table>
</div>
```

(Using `<table>` layout because Outlook and older email clients don't support CSS flexbox.)

**c) Auto-linkify URLs in email body** (line 408-411):

```typescript
// Current
const htmlBody = body.split('\n').map(line => {
  if (line.trim() === '') return '<br/>';
  return `<p>${line}</p>`;
}).join('');

// New -- adds regex to wrap URLs in <a> tags
const htmlBody = body.split('\n').map(line => {
  if (line.trim() === '') return '<br/>';
  const linked = line.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" style="color:#2563eb;text-decoration:underline;">$1</a>'
  );
  return `<p>${linked}</p>`;
}).join('');
```

**d) Also apply the same logo-fetch logic to the test-email paths** (around lines 537 and 615) so test emails also show the branding logo.

### 2. `DOCUMENTATION.md`

- Note that the Global Branding app logo is now used in email headers (top-right)
- Note that URLs in email templates are automatically converted to clickable hyperlinks
