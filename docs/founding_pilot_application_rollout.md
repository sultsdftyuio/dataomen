# Founding-pilot landing and application rollout

The landing page offers three distinct paths: a free website brief, the existing $35/month public-conversation scanner, and an application-based reviewed prospect pilot. The new pilot form does not enroll a workspace, start a subscription, or promise a weekly quantity.

## Database setup for the application form

First use a dedicated staging project. In its Supabase SQL editor, open `scripts/pilot_application_contract.sql`, paste its full contents, and run it. Then run the full contents of `scripts/verify_pilot_application_contract.sql` in the same staging project. The verification script checks the installed table and rolls back its test application. Once staging passes, apply `scripts/pilot_application_contract.sql` to the production project through its normal migration path. Running verification before the migration, or in a different project, produces a missing-table error.

The application form does not depend on the assisted prospect delivery or candidate contracts. `scripts/verify_assisted_candidate_contract.sql` belongs to the separate in-app prospect pilot; use it only in a dedicated staging database after the three migrations listed in `docs/assisted_prospect_pilot_rollout.md`.

## Before sending traffic

1. Apply `scripts/pilot_application_contract.sql` through the normal database migration path. Run `scripts/verify_pilot_application_contract.sql` in staging, then verify with actual anon/authenticated API credentials that neither role can read or write `public.pilot_applications` while the server service role can insert and read it.
2. Set `ARCLI_PILOT_APPLICATION_SALT` on the Next.js server to a distinct random value of at least 32 characters. Confirm `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are already configured server-side. Do not put the service key or the salt in a `NEXT_PUBLIC_` variable.
3. Submit one authorized staging application at `/pilot`. Confirm the HTTP response is 202, the success state appears, and exactly one row is stored. Confirm malformed URLs, missing offer/ICP, overlong bodies, cross-origin requests, and fourth submissions from one rate-limit identifier are rejected. Confirm a database outage returns a visible error and does not show success.
4. Assign an operator to check the queue each business day with `pnpm exec tsx scripts/manage_pilot_applications.ts list`. Decide whether the market merits a call, set the review status with `set-status UUID qualified --commit` or `declined --commit`, and reply from the monitored `support@arcli.tech` address. The application form does not send an automatic email; the private queue is the source of truth.
5. Run `pnpm exec tsx scripts/manage_pilot_applications.ts purge --commit` on a daily operator schedule and record its success. It removes applications after their 180-day expiry. Handle verified deletion requests sooner. If the operator schedule or queue monitoring is not in place, keep paid advertising off.
6. Deploy the page and form only after the intake smoke test. Check desktop and mobile rendering, all CTA destinations, the free and Pro checkout paths, and the live page's text/metadata. The repository can differ from the currently deployed site.

The pilot delivery database contracts and reviewer workflow have their own release gate in `docs/assisted_prospect_pilot_rollout.md`. Receiving an application does not mean Arcli can fulfill it. Operators should offer a pilot only after a specific source coverage and review-capacity assessment.
