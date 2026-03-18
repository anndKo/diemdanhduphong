
-- Create account registration requests table
CREATE TABLE public.account_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  phone TEXT,
  device_hash TEXT NOT NULL,
  ip_address TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID
);

-- Enable RLS
ALTER TABLE public.account_requests ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (no auth required for requesting)
CREATE POLICY "Anyone can insert account requests"
ON public.account_requests
FOR INSERT
WITH CHECK (true);

-- Only admin can view
CREATE POLICY "Only admin can view account requests"
ON public.account_requests
FOR SELECT
USING (auth.email() = 'admindiemdanh@gmail.com');

-- Only admin can update
CREATE POLICY "Only admin can update account requests"
ON public.account_requests
FOR UPDATE
USING (auth.email() = 'admindiemdanh@gmail.com');

-- Only admin can delete
CREATE POLICY "Only admin can delete account requests"
ON public.account_requests
FOR DELETE
USING (auth.email() = 'admindiemdanh@gmail.com');
