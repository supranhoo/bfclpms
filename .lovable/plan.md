

## Add Final Score + Animated Sparkles to KPI Finalized Email (Updated)

### Problem
1. The `final_approved` email template doesn't show the final score.
2. When score is **4 or more**, the email should have floating/animated sparkles and a congratulations banner.

### Changes

#### File: `supabase/functions/send-email-notification/index.ts`

**1. Update `final_approved` template** — Add `Final Score: {{final_score}} / 5 — {{score_label}}` line after the Period line.

**2. Score-to-label mapping + placeholder injection** — When `event_type === 'final_approved'` and `final_score` is provided:
- Map: `{ '5': 'Outstanding', '4': 'Exceeds Expectations', '3': 'Meets Expectations', '2': 'Needs Improvement', '1': 'Below Expectations', '0': 'Not Achieved' }`
- Set `placeholderData.final_score` and `placeholderData.score_label`

**3. Update `buildEmailHtml`** — Accept optional `finalScore` parameter. When `eventType === 'final_approved'` and `parseFloat(finalScore) >= 4`:
- Add CSS `@keyframes sparkle-float` and `sparkle-sway` animations
- Inject ~10 absolutely-positioned sparkle emoji elements (`✨`, `⭐`, `🌟`) with varying delays and durations for continuous floating
- Add gold-gradient "🎉 Congratulations!" banner
- Graceful degradation for Gmail (static emojis)

**4. Pass `finalScore` to `buildEmailHtml` call** from the request body.

### Key difference from previous implementation
The sparkle condition changes from `finalScore === '5'` to `parseFloat(finalScore) >= 4`, so both scores 4 and 5 trigger the celebration.

### No database changes needed

