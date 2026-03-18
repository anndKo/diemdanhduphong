
-- Create bonus_codes table for the bonus code system
CREATE TABLE public.bonus_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unused',
  used_by_name TEXT,
  used_by_code TEXT,
  used_by_group TEXT,
  week_number INTEGER,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  used_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.bonus_codes ENABLE ROW LEVEL SECURITY;

-- Anyone can read bonus codes (needed for students to validate codes)
CREATE POLICY "Anyone can read bonus_codes" ON public.bonus_codes FOR SELECT USING (true);

-- Teachers can manage bonus codes
CREATE POLICY "Teachers can manage bonus_codes" ON public.bonus_codes FOR ALL 
  USING (EXISTS (SELECT 1 FROM teachers WHERE teachers.email = auth.email()))
  WITH CHECK (EXISTS (SELECT 1 FROM teachers WHERE teachers.email = auth.email()));

-- Anyone can update bonus codes (for students using codes during attendance)
CREATE POLICY "Anyone can update bonus_codes" ON public.bonus_codes FOR UPDATE USING (true);

-- Add bonus_points_enabled column to classes if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'classes' AND column_name = 'bonus_points_enabled') THEN
    ALTER TABLE public.classes ADD COLUMN bonus_points_enabled BOOLEAN DEFAULT false;
  END IF;
END $$;
