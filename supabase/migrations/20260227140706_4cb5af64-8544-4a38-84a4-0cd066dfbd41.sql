
CREATE TABLE public.student_warnings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id UUID NOT NULL,
  student_code TEXT NOT NULL,
  student_name TEXT NOT NULL,
  group_number TEXT,
  photo_url TEXT,
  reason TEXT DEFAULT 'Cảnh báo từ admin',
  week_number INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.student_warnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view warnings" ON public.student_warnings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can insert warnings" ON public.student_warnings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone can delete warnings" ON public.student_warnings FOR DELETE TO authenticated USING (true);
