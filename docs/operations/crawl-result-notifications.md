# Website refresh result emails

Apply [crawl_result_notifications.sql](../../scripts/crawl_result_notifications.sql) before deploying the application code that reads `crawl_completion_email_enabled`. Reapply it on an existing installation to set the preference-column default to off and add the opt-in timestamp, account email, and notice version. Existing rows without that evidence are treated as off until the person enables the updated setting. The migration is additive and may be applied while the current workers are running.

Keep `ARCLI_CRAWL_RESULT_EMAILS_ENABLED=false` for the first deployment. Confirm that:

- `ARCLI_CRAWL_RESULT_EMAIL_API_KEY` is a Resend API key with permission to send;
- `ARCLI_CRAWL_RESULT_EMAIL_SENDER` is a verified sender in the form `Arcli <notifications@example.com>`;
- `ARCLI_DASHBOARD_URL` is the public HTTPS dashboard URL (`https://www.arcli.tech/dashboard` in this deployment); and
- the normal worker consumes the `notifications` queue.

The checked-in `.do/app.yaml` keeps delivery disabled. Saving an enabled personal preference does not prove that the worker is configured or that a message was delivered. Use `python scripts/diagnose_crawl_result_email.py --include-outbox` in the worker environment to check the flag, sender configuration, and recent outbox states without sending mail or displaying full recipient addresses.

Only owners/admins who explicitly enable **Settings → Result emails** are eligible. The setting records when the person opted in, the account email used, and which notice was shown. A missing or legacy preference is off, including when an old outbox row is retried. Changing the account email turns result mail off until the person opts in again. Have a test recipient opt in, then enable the flag and run one controlled Free and Pro crawl. The first test should create one outbox row per opted-in recipient and one Resend event per row. Turning the preference off before delivery should suppress a pending row. Changing the account email before delivery should suppress mail to the old address. Replaying the same crawl or discovery terminal event must not create another email because the outbox uses `(tenant_id, user_id, event_key)` as its durable idempotency boundary.

The initial rollout defaults to a 20-hour recipient-level interval cap, three provider retries, a 15-minute recovery grace period, and 90-day terminal-outbox retention. Keep those bounds unless provider limits and inbox feedback justify a measured change. Emails contain only a website host and aggregate counts: never lead identities, source-post text, or raw crawl content.

The website email confirms only that a brief was prepared. A discovery email reports a checkpoint, not a promise that all candidate checks have finished or that its count equals the current dashboard queue. Partial runs say their coverage or time window was incomplete, and a zero count is not a market-demand conclusion. The email copy omits source-post totals because collection and matching counters are not interchangeable.

To suppress a destination after a complaint or hard bounce, insert its normalized email address and reason into `public.crawl_notification_suppressions`. Each workspace owner or admin can turn off their own future result mail in **Settings → Result emails**, without changing anyone else's preference. Each message links to that setting. Messages already handed to the provider cannot be recalled.

## Multi-region launch review

Keep these messages limited to neutral account results and failures. Do not add upgrade offers, discounts, or other promotional content to this notification stream. The preference is an affirmative opt-in tied to the current account email; changing that address requires a new opt-in. Account-security and billing messages are separate. Before enabling delivery across regions, have counsel confirm the operating legal entity, privacy-notice legal bases, recipient jurisdictions, email-provider terms, and whether any planned message is marketing rather than a service update. See the [FTC's transactional-versus-commercial email guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business), the [UK ICO's service-message guidance](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/direct-marketing-guidance/identify-direct-marketing/), [GDPR Article 13](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng), and the [UAE personal-data law](https://www.uaelegislation.gov.ae/en/legislations/1972/download). This checklist records the product's controls; it is not a jurisdiction-wide legal clearance.
