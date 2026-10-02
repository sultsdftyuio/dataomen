-- Private intake for founding prospect-pilot coverage reviews.
CREATE TABLE IF NOT EXISTS public.pilot_applications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    requester_fingerprint text NOT NULL CHECK (requester_fingerprint ~ '^[a-f0-9]{64}$'),
    email text NOT NULL CHECK (length(email) BETWEEN 3 AND 320),
    website_url text NOT NULL CHECK (length(website_url) BETWEEN 10 AND 2048),
    offer text NOT NULL CHECK (length(offer) BETWEEN 10 AND 500),
    ideal_customer text NOT NULL CHECK (length(ideal_customer) BETWEEN 10 AND 700),
    buyer_role text CHECK (buyer_role IS NULL OR length(buyer_role) <= 160),
    geography text CHECK (geography IS NULL OR length(geography) <= 160),
    status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'qualified', 'declined', 'closed')),
    reviewed_at timestamptz,
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '180 days')
);

CREATE INDEX IF NOT EXISTS pilot_applications_fingerprint_created_idx
    ON public.pilot_applications(requester_fingerprint, created_at DESC);
CREATE INDEX IF NOT EXISTS pilot_applications_new_idx
    ON public.pilot_applications(created_at ASC) WHERE status = 'new';
CREATE INDEX IF NOT EXISTS pilot_applications_expiry_idx
    ON public.pilot_applications(expires_at);

ALTER TABLE public.pilot_applications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pilot_applications FROM PUBLIC;
REVOKE ALL ON public.pilot_applications FROM anon, authenticated;
REVOKE ALL ON public.pilot_applications FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pilot_applications TO service_role;
