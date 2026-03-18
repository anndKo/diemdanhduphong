-- Create table for protection passwords (6-digit PIN per user)
CREATE TABLE public.protection_passwords (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    password_hash TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id)
);

-- Enable Row Level Security
ALTER TABLE public.protection_passwords ENABLE ROW LEVEL SECURITY;

-- Users can only access their own protection password
CREATE POLICY "Users can view their own protection password" 
ON public.protection_passwords 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own protection password" 
ON public.protection_passwords 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own protection password" 
ON public.protection_passwords 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create a secure function to hash and verify passwords (using pgcrypto)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Function to set protection password (hashes before storing)
CREATE OR REPLACE FUNCTION public.set_protection_password(p_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO protection_passwords (user_id, password_hash, enabled)
  VALUES (auth.uid(), crypt(p_password, gen_salt('bf')), true)
  ON CONFLICT (user_id) 
  DO UPDATE SET 
    password_hash = crypt(p_password, gen_salt('bf')),
    enabled = true,
    updated_at = now();
  RETURN true;
END;
$$;

-- Function to verify protection password
CREATE OR REPLACE FUNCTION public.verify_protection_password(p_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stored_hash TEXT;
  is_enabled BOOLEAN;
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

-- Function to check if protection password is enabled
CREATE OR REPLACE FUNCTION public.is_protection_password_enabled()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_enabled BOOLEAN;
BEGIN
  SELECT enabled INTO is_enabled
  FROM protection_passwords
  WHERE user_id = auth.uid();
  
  RETURN COALESCE(is_enabled, false);
END;
$$;

-- Function to disable protection password
CREATE OR REPLACE FUNCTION public.disable_protection_password()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE protection_passwords 
  SET enabled = false, updated_at = now()
  WHERE user_id = auth.uid();
  RETURN true;
END;
$$;