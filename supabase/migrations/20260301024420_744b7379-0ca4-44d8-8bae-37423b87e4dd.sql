
-- Backfill old classes: assign created_by to the admin user
UPDATE classes 
SET created_by = (SELECT id FROM auth.users WHERE email = 'admindiemdanh@gmail.com' LIMIT 1)
WHERE created_by IS NULL;
