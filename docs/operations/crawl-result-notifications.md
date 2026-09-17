# Website refresh result emails

Apply [crawl_result_notifications.sql](../../scripts/crawl_result_notifications.sql) before deploying the application code that reads `crawl_completion_email_enabled`. The migration is additive and may be applied while the current workers are running.

Keep `ARCLI_CRAWL_RESULT_EMAILS_ENABLED=false` for the first deployment. Confirm that:

- `ARCLI_CRAWL_RESULT_EMAIL_API_KEY` is a Resend API key with permission to send;
- `ARCLI_CRAWL_RESULT_EMAIL_SENDER` is a verified sender in the form `Arcli <notifications@example.com>`;
- `ARCLI_DASHBOARD_URL` is the public HTTPS dashboard URL; and
- the normal worker consumes the `notifications` queue.

Then enable the flag and run one controlled Free and Pro crawl. The first test should create one outbox row per workspace owner/admin and one Resend event per row. Replaying the same crawl or discovery terminal event must not create another email because the outbox uses `(tenant_id, user_id, event_key)` as its durable idempotency boundary.

The initial rollout defaults to a 20-hour recipient-level interval cap, three provider retries, a 15-minute recovery grace period, and 90-day terminal-outbox retention. Keep those bounds unless provider limits and inbox feedback justify a measured change. Emails contain only a website host and aggregate counts: never lead identities, source-post text, or raw crawl content.

To suppress a destination after a complaint or hard bounce, insert its normalized email address and reason into `public.crawl_notification_suppressions`. Each workspace owner or admin can turn off their own future refresh mail in **Settings → Website refresh emails**, without changing anyone else's preference. Existing rows that already reached the provider are intentionally not recalled.
