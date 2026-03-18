
-- Create IP blocks table for rate limiting by IP address
CREATE TABLE public.ip_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL UNIQUE,
  blocked_until timestamp with time zone,
  block_count integer NOT NULL DEFAULT 0,
  is_permanent boolean NOT NULL DEFAULT false,
  reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ip_blocks ENABLE ROW LEVEL SECURITY;

-- No public access - only edge functions with service role can access
CREATE POLICY "No public access to ip_blocks"
  ON public.ip_blocks
  FOR SELECT
  USING (false);
