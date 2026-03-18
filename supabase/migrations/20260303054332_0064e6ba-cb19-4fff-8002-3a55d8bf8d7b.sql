
-- Allow admin to read device_blocks
CREATE POLICY "Admin can view device_blocks"
ON public.device_blocks
FOR SELECT
TO authenticated
USING (auth.email() = 'admindiemdanh@gmail.com');

-- Allow admin to delete device_blocks (for unblock)
CREATE POLICY "Admin can delete device_blocks"
ON public.device_blocks
FOR DELETE
TO authenticated
USING (auth.email() = 'admindiemdanh@gmail.com');

-- Allow admin to read security_logs
CREATE POLICY "Admin can view security_logs"
ON public.security_logs
FOR SELECT
TO authenticated
USING (auth.email() = 'admindiemdanh@gmail.com');

-- Allow admin to read login_attempts
CREATE POLICY "Admin can view login_attempts"
ON public.login_attempts
FOR SELECT
TO authenticated
USING (auth.email() = 'admindiemdanh@gmail.com');

-- Allow admin to read device_fingerprints
CREATE POLICY "Admin can view device_fingerprints"
ON public.device_fingerprints
FOR SELECT
TO authenticated
USING (auth.email() = 'admindiemdanh@gmail.com');
