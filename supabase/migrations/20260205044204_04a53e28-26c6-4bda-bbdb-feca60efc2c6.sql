-- Fix gen_salt function by properly casting the algorithm parameter
-- and ensure pgcrypto is enabled

-- Enable pgcrypto extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Recreate set_protection_password with explicit text cast
CREATE OR REPLACE FUNCTION public.set_protection_password(p_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO protection_passwords (user_id, password_hash, enabled)
  VALUES (auth.uid(), crypt(p_password, gen_salt('bf'::text)), true)
  ON CONFLICT (user_id) 
  DO UPDATE SET 
    password_hash = crypt(p_password, gen_salt('bf'::text)),
    enabled = true,
    updated_at = now();
  RETURN true;
END;
$$;

-- Recreate verify_protection_password with explicit text cast
CREATE OR REPLACE FUNCTION public.verify_protection_password(p_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stored_hash text;
  is_enabled boolean;
BEGIN
  SELECT password_hash, enabled INTO stored_hash, is_enabled
  FROM protection_passwords
  WHERE user_id = auth.uid();

  IF NOT FOUND OR NOT is_enabled THEN
    RETURN true; -- No password set or disabled, allow access
  END IF;

  RETURN stored_hash = crypt(p_password, stored_hash);
END;
$$;