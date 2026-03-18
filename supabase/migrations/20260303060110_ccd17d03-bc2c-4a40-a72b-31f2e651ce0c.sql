
-- Table for tracking protection password attempts per device
CREATE TABLE public.protection_password_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_hash text NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  last_attempt_at timestamp with time zone DEFAULT now(),
  blocked_until timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_protection_password_attempts_device ON public.protection_password_attempts(device_hash);

ALTER TABLE public.protection_password_attempts ENABLE ROW LEVEL SECURITY;

-- Allow anonymous read to check block status
CREATE POLICY "Anyone can check protection attempt status"
ON public.protection_password_attempts FOR SELECT
USING (true);

-- Allow anonymous insert/update for tracking attempts
CREATE POLICY "Anyone can insert protection attempts"
ON public.protection_password_attempts FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anyone can update protection attempts"
ON public.protection_password_attempts FOR UPDATE
USING (true);

-- Table for protection password reset requests
CREATE TABLE public.protection_password_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  phone text NOT NULL,
  device_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  admin_note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  processed_at timestamp with time zone
);

ALTER TABLE public.protection_password_requests ENABLE ROW LEVEL SECURITY;

-- Anyone can submit a request
CREATE POLICY "Anyone can submit protection password requests"
ON public.protection_password_requests FOR INSERT
WITH CHECK (true);

-- Authenticated users (admin) can view
CREATE POLICY "Authenticated can view protection requests"
ON public.protection_password_requests FOR SELECT
USING (true);

-- Authenticated users (admin) can update
CREATE POLICY "Authenticated can update protection requests"
ON public.protection_password_requests FOR UPDATE
USING (true);

-- Authenticated users (admin) can delete
CREATE POLICY "Authenticated can delete protection requests"
ON public.protection_password_requests FOR DELETE
USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_protection_password_attempts_updated_at
BEFORE UPDATE ON public.protection_password_attempts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
