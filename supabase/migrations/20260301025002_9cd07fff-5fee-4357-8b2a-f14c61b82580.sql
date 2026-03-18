
-- Device fingerprints: track which devices registered which accounts
CREATE TABLE public.device_fingerprints (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_hash text NOT NULL,
  user_id uuid NOT NULL,
  ip_address text,
  user_agent text,
  raw_components jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Login attempts: track every login attempt
CREATE TABLE public.login_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_hash text NOT NULL,
  email text,
  ip_address text,
  user_agent text,
  success boolean NOT NULL DEFAULT false,
  behavior_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Device blocks: block devices after too many failures
CREATE TABLE public.device_blocks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_hash text NOT NULL UNIQUE,
  blocked_until timestamptz,
  block_count integer NOT NULL DEFAULT 0,
  reason text,
  is_permanent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Security logs: comprehensive audit trail
CREATE TABLE public.security_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_hash text,
  ip_address text,
  action text NOT NULL,
  details jsonb,
  risk_score integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_device_fingerprints_hash ON public.device_fingerprints(device_hash);
CREATE INDEX idx_login_attempts_device ON public.login_attempts(device_hash, created_at DESC);
CREATE INDEX idx_login_attempts_email ON public.login_attempts(email, created_at DESC);
CREATE INDEX idx_device_blocks_hash ON public.device_blocks(device_hash);
CREATE INDEX idx_security_logs_device ON public.security_logs(device_hash, created_at DESC);

-- RLS
ALTER TABLE public.device_fingerprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_logs ENABLE ROW LEVEL SECURITY;

-- These tables are managed by edge functions with service role key, no public access
CREATE POLICY "No public access to device_fingerprints" ON public.device_fingerprints FOR SELECT USING (false);
CREATE POLICY "No public access to login_attempts" ON public.login_attempts FOR SELECT USING (false);
CREATE POLICY "No public access to device_blocks" ON public.device_blocks FOR SELECT USING (false);
CREATE POLICY "No public access to security_logs" ON public.security_logs FOR SELECT USING (false);
