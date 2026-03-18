-- Add advanced_verification column to classes table
ALTER TABLE public.classes 
ADD COLUMN IF NOT EXISTS advanced_verification boolean DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN public.classes.advanced_verification IS 'When enabled, students must pass liveness verification before filling attendance form';