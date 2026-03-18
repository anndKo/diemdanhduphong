
-- Create a function to verify a password against a specific hash (no auth.uid() dependency)
CREATE OR REPLACE FUNCTION public.verify_protection_password_raw(p_password text, p_hash text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  SELECT p_hash = extensions.crypt(p_password, p_hash);
$$;
