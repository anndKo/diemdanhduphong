
-- Create bug_reports table
CREATE TABLE public.bug_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_hash text NOT NULL,
  content text NOT NULL,
  file_urls jsonb DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  admin_note text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (public reporting)
CREATE POLICY "Anyone can insert bug reports"
  ON public.bug_reports FOR INSERT
  WITH CHECK (true);

-- Only authenticated users can view (admin)
CREATE POLICY "Authenticated users can view bug reports"
  ON public.bug_reports FOR SELECT
  TO authenticated
  USING (true);

-- Only authenticated users can update
CREATE POLICY "Authenticated users can update bug reports"
  ON public.bug_reports FOR UPDATE
  TO authenticated
  USING (true);

-- Only authenticated users can delete
CREATE POLICY "Authenticated users can delete bug reports"
  ON public.bug_reports FOR DELETE
  TO authenticated
  USING (true);

-- Create storage bucket for report files (public for easy access)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('bug-reports', 'bug-reports', true, 104857600);

-- Storage policies
CREATE POLICY "Anyone can upload bug report files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'bug-reports');

CREATE POLICY "Anyone can view bug report files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'bug-reports');

CREATE POLICY "Authenticated users can delete bug report files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'bug-reports');
