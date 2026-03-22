

## Add Final Score + Animated Sparkles to KPI Finalized Email

### Problem
1. The `final_approved` email template doesn't show the final score.
2. The previous plan called for static sparkles for score 5 — the user wants them to be **floating/animated** every time the email is opened.

### Approach

Email clients have limited CSS animation support, but `@keyframes` with `animation` works in Apple Mail, iOS Mail, Outlook.com, and many webmail clients (Gmail strips it, but the email still looks fine with static fallback). We'll use CSS `@keyframes` for floating sparkle emojis.

### Changes

#### File: `supabase/functions/send-email-notification/index.ts`

**1. Update `final_approved` template (lines 306-317)**
- Add `Final Score: {{final_score}} / 5 — {{score_label}}` line after the Period line.
- Template body remains generic; the score-5 celebration is handled in `buildEmailHtml`.

**2. Add score-to-label mapping + placeholder injection (before line 1304)**
- When `event_type === 'final_approved'` and `final_score` is provided in the request body:
  - Map score to label: `{ '5': 'Outstanding', '4': 'Exceeds Expectations', '3': 'Meets Expectations', '2': 'Needs Improvement', '1': 'Below Expectations', '0': 'Not Achieved' }`
  - Set `placeholderData.final_score` and `placeholderData.score_label`
  - If score is missing, default to `'N/A'`

**3. Update `buildEmailHtml` (lines 717-775)**
- Accept optional `finalScore` parameter in the customization object.
- When `eventType === 'final_approved'` and `finalScore === '5'`:
  - Add CSS `@keyframes` for floating animation: stars/sparkles float upward, fade in/out, and drift side to side at different speeds.
  - Inject ~8-10 absolutely-positioned sparkle emoji elements (`✨`, `⭐`, `🌟`) with varying `animation-delay`, `animation-duration`, and `left` positions across the email width.
  - Add a gold-gradient "🎉 Congratulations! Outstanding Performance! 🎉" banner above the content area.
  - The sparkle container uses `overflow: hidden` and `position: relative` so sparkles float within the email boundaries.
  - For email clients that strip `@keyframes` (Gmail), the sparkles degrade gracefully to static positioned emojis — still celebratory, just not animated.

**4. Pass `finalScore` to `buildEmailHtml` call (line 1306)**
- Extract `final_score` from request body and pass it: `buildEmailHtml(event_type, bodyContent, { logoUrl, footerText, finalScore: final_score })`

### CSS Animation Detail
```css
@keyframes float-up {
  0% { transform: translateY(0) rotate(0deg); opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { transform: translateY(-400px) rotate(720deg); opacity: 0; }
}
@keyframes sway {
  0%, 100% { transform: translateX(0); }
  50% { transform: translateX(20px); }
}
```
Each sparkle element combines both animations with different durations (3-6s) and delays (0-4s), set to `infinite` so they keep floating every time the email is viewed.

### No database changes needed

