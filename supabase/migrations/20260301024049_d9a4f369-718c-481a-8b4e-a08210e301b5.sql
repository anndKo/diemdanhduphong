
CREATE OR REPLACE FUNCTION public.set_protection_password(p_password text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  INSERT INTO protection_passwords (user_id, password_hash, enabled)
  VALUES (auth.uid(), extensions.crypt(p_password, extensions.gen_salt('bf')), true)
  ON CONFLICT (user_id) 
  DO UPDATE SET 
    password_hash = extensions.crypt(p_password, extensions.gen_salt('bf')),
    enabled = true,
    updated_at = now();
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.verify_protection_password(p_password text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  stored_hash text;
  is_enabled boolean;
BEGIN
  SELECT password_hash, enabled INTO stored_hash, is_enabled
  FROM protection_passwords
  WHERE user_id = auth.uid();

  IF NOT FOUND OR NOT is_enabled THEN
    RETURN true;
  END IF;

  RETURN stored_hash = extensions.crypt(p_password, stored_hash);
END;
$function$;
