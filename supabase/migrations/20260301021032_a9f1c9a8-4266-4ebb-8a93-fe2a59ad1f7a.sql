
-- Allow teachers (found in teachers table) to manage classes
CREATE POLICY "teachers_manage_classes"
ON public.classes
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.teachers
    WHERE teachers.email = auth.email()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.teachers
    WHERE teachers.email = auth.email()
  )
);

-- Allow teachers to manage attendance_records
CREATE POLICY "teachers_manage_attendance"
ON public.attendance_records
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.teachers
    WHERE teachers.email = auth.email()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.teachers
    WHERE teachers.email = auth.email()
  )
);

-- Allow teachers to manage students
CREATE POLICY "teachers_manage_students"
ON public.students
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.teachers
    WHERE teachers.email = auth.email()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.teachers
    WHERE teachers.email = auth.email()
  )
);

-- Allow teachers to manage student_warnings
CREATE POLICY "teachers_manage_warnings"
ON public.student_warnings
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.teachers
    WHERE teachers.email = auth.email()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.teachers
    WHERE teachers.email = auth.email()
  )
);

-- Allow teachers to manage their own protection passwords
CREATE POLICY "teachers_manage_protection"
ON public.protection_passwords
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
