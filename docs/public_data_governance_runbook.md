# Public-source data governance runbook

Apply [`scripts/public_data_compliance_contract.sql`](../scripts/public_data_compliance_contract.sql) before deploying the matching application code. The worker configuration in `.do/app.yaml` sets the default source-content retention period to 30 days and enables suppression checks.

## Before production

1. Set `ARCLI_PRIVACY_REQUEST_SALT` in the Next.js host to a long, random secret. The public removal form returns a safe error until this value is set. It is used only to hash request rate-limit identifiers; do not reuse an application secret.
2. Ensure the Next.js host has `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, because the public form records a verified-request queue without exposing it to browser users.
3. Confirm that `support@arcli.tech` is monitored and that an operator knows how to verify removal requests.
4. Have counsel confirm the Arcli legal entity, registered address, regional lawful bases, transfer safeguards, and final policy wording before broad commercial launch.

## Completing a verified removal request

1. Open `public.public_data_removal_requests` in Supabase and verify that the requester controls the relevant public account or is otherwise authorised.
2. In the Supabase SQL editor, run the following with the request ID:

```sql
SELECT *
FROM public.complete_public_data_removal_request('REQUEST_ID_HERE'::uuid);
```

3. Confirm the returned deletion counts. The function deletes matching global source posts, tenant lead-brief copies, and buyer-language research evidence; it then marks the request `completed`. Future ingestion suppresses the matching post ID, public handle, or public URL.

Do not complete an unverified request. If it is invalid, set its status to `rejected` and document the reason in your internal support system, not in the public-data record.

## Retention

Every active discovery run queues a low-priority maintenance job at most once per hour. It deletes public source posts and their lead-brief copies once they are older than `ARCLI_PUBLIC_DATA_RETENTION_DAYS` (30 by default). It also deletes buyer-language research evidence from the same period. The job uses a database advisory lock, so concurrent workers cannot purge the corpus at the same time.

After `ARCLI_PRIVACY_REQUEST_RETENTION_DAYS` (90 by default), resolved removal requests have their requester email, rate-limit fingerprint, and free-form explanation anonymised. The completed suppression identity remains so the same public item cannot be collected again.

If the worker is not running, retention does not happen automatically. Restore the worker first; do not extend the retention setting above 90 days without counsel approval.
