## Assumptions
- The CAPA marker `data-capa-build="2026-06-04b"` IS present in `src/components/layout/AppSidebar.tsx` line 513 (verified).
- Lovable reports the project is published, visibility public.
- The Update button being greyed out means Lovable's publish pipeline sees **no undeployed diff** — i.e. the latest source (including marker `b`) is already what's published on `bfclpms.lovable.app`.
- The live page screenshot is from `pms.bfclalloys.com` (custom domain), and the CSS bundle shown is `index-CELM165a.css` — an older hash.

## Most likely root cause
The Lovable-hosted publish (`bfclpms.lovable.app`) is up to date, but the **custom domain `pms.bfclalloys.com` is serving a stale bundle**. Possible reasons, in order of likelihood:

1. **External CDN / proxy in front of the custom domain** (Cloudflare, etc.) caching `index.html` and the JS bundle. Lovable's own hosting doesn't typically cache `index.html`, so a stale HTML referencing an old `index-*.js` strongly points to an upstream proxy.
2. **Browser / Service Worker cache** holding the old `index.html` even after hard refresh (Ctrl+Shift+R doesn't always bypass SW).
3. **Custom domain not actually pointing at the latest Lovable deployment** (DNS still pointing at a previous host, or a different project).
4. Less likely: the marker bump never reached Lovable's publish snapshot (would normally re-enable Update; since Update is greyed, this is unlikely).

The Update button is greyed *because there is genuinely nothing for Lovable to publish* — bumping the marker again will not help and is not the fix.

## Risk & Impact Report
- **Data Impact:** None. Diagnosis only.
- **Workflow Impact:** None.
- **UI/UX Impact:** None until cause is confirmed.
- **Regression Risk:** None — no code/data changes proposed in this step.
- **Scalability Impact:** N/A.
- **Mitigation:** Verify via the canonical Lovable domain first before touching code or data again.
- **Rollback:** N/A.

## Step-by-step Plan (verification only — no code/data changes)

1. **Test the canonical Lovable URL directly**
   - Open `https://bfclpms.lovable.app/dashboard` in a fresh incognito window (no extensions, no SW).
   - DevTools → Elements → search for `data-capa-build`.
   - Note the `assets/index-*.js` filename in Network.
   - Expected: marker present, sidebar populated. Confirms Lovable publish is healthy.

2. **Compare with custom domain**
   - Same check on `https://pms.bfclalloys.com/dashboard` in incognito.
   - If marker is MISSING here but PRESENT on `bfclpms.lovable.app` → confirmed: the custom domain is fronted by an external cache or pointing elsewhere.

3. **Identify the proxy / DNS situation for `pms.bfclalloys.com`**
   - Inspect response headers on the custom domain (`server`, `cf-ray`, `x-cache`, `age`, `via`).
   - Compare with headers from `bfclpms.lovable.app`.
   - If Cloudflare (or similar) is in front: user purges the proxy cache for `/`, `/dashboard`, and `/assets/*`.
   - If DNS is wrong: user updates the custom domain in Lovable Project Settings → Domains so the CNAME points to the current Lovable host, then waits for DNS to propagate.

4. **Service Worker / browser cache sanity**
   - DevTools → Application → Service Workers → Unregister any SW for the custom domain.
   - DevTools → Application → Storage → "Clear site data".
   - Hard refresh again and re-check the marker.

5. **Decision gate**
   - If after steps 1–4 the marker appears on `pms.bfclalloys.com`, root cause was upstream caching/SW; CAPA fix already shipped and is live. We can then validate sidebar + auditor pages.
   - If the marker appears on `bfclpms.lovable.app` but never on `pms.bfclalloys.com` even after proxy purge, the custom domain is not pointing at this deployment — needs DNS/domain reconfiguration in Lovable.
   - If the marker is missing on BOTH after a true cache-busted reload, then the publish pipeline didn't actually take the latest source despite saying "no changes" — in that case the fix is to force a republish (a different code change, e.g. updating an in-bundle string visible at runtime) and revisit.

## UI Changes
Not Applicable in this verification step.

## Implementation
No implementation in this step. This is a verification plan; code/data changes only occur after Step 5 identifies the actual cause.

## Tests
Not Applicable for this step.

## DOCUMENTATION.md updates
None for verification. If Step 5 leads to a DNS/cache fix, document the custom-domain hosting/CDN configuration so this doesn't recur.

## POLICY.md updates
None.

## Post-implementation notes
- The Update button is greyed because Lovable currently has nothing new to publish, not because the domain is private or the marker bump failed. Repeatedly asking you to click Update is the wrong instruction — apologies for the loop.
- Please run Step 1 first (incognito on `bfclpms.lovable.app/dashboard`) and report:
  (a) whether `data-capa-build="2026-06-04b"` is in the DOM, and
  (b) the `assets/index-*.js` filename.
  That single answer determines whether the issue is the Lovable publish or the custom domain in front of it.
