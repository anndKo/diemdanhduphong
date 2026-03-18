
-- Add ip_address to protection_password_attempts for IP-based tracking
ALTER TABLE public.protection_password_attempts 
ADD COLUMN IF NOT EXISTS ip_address text;

-- Create index for fast IP lookups
CREATE INDEX IF NOT EXISTS idx_protection_attempts_ip ON public.protection_password_attempts(ip_address);
CREATE INDEX IF NOT EXISTS idx_protection_attempts_device ON public.protection_password_attempts(device_hash);
