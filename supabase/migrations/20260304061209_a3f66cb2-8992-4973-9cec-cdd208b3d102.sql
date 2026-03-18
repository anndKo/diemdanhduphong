
-- Create protection_password_attempts table for tracking brute-force on protection passwords
CREATE TABLE public.protection_password_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_hash text NOT NULL,
  ip_address text,
  attempt_count integer NOT NULL DEFAULT 0,
  blocked_until timestamp with time zone,
  last_attempt_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create unique index on device_hash
CREATE UNIQUE INDEX idx_protection_password_attempts_device ON public.protection_password_attempts(device_hash);

-- Enable RLS
ALTER TABLE public.protection_password_attempts ENABLE ROW LEVEL SECURITY;

-- Only service role (edge functions) can access this table
CREATE POLICY "No public access to protection_password_attempts"
ON public.protection_password_attempts
FOR SELECT USING (false);

-- Admin can view for security management
CREATE POLICY "Admin can view protection_password_attempts"
ON public.protection_password_attempts
FOR SELECT USING (auth.email() = 'admindiemdanh@gmail.com');

-- Admin can delete (for clearing blocks)
CREATE POLICY "Admin can delete protection_password_attempts"
ON public.protection_password_attempts
FOR DELETE USING (auth.email() = 'admindiemdanh@gmail.com');

-- Create a security definer function to disable protection password for a specific user by email
CREATE OR REPLACE FUNCTION public.admin_disable_protection_password(target_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  target_user_id uuid;
BEGIN
  -- Only admin can call this
  IF auth.email() != 'admindiemdanh@gmail.com' THEN
    RETURN false;
  END IF;

  -- Find user_id from profiles by email
  SELECT user_id INTO target_user_id
  FROM profiles
  WHERE email = target_email
  LIMIT 1;

  IF target_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Disable protection password for that user
  UPDATE protection_passwords
  SET enabled = false, updated_at = now()
  WHERE user_id = target_user_id;

  RETURN true;
END;
$$;
