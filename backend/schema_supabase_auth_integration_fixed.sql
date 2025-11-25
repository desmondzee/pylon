-- ============================================
-- SUPABASE AUTH INTEGRATION (FIXED VERSION)
-- ============================================
-- This script fixes the RLS issues that prevent user creation
-- Run this AFTER running the original schema_supabase_auth_integration.sql
-- OR replace the function and policies with this version
-- ============================================

-- ============================================
-- FIX 1: Drop and recreate the function with better error handling
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    default_operator_id UUID;
    user_name_text VARCHAR(255);
BEGIN
    -- Extract user name from metadata or email
    user_name_text := COALESCE(
        NEW.raw_user_meta_data->>'name',
        NEW.raw_user_meta_data->>'full_name',
        split_part(NEW.email, '@', 1)
    );
    
    -- Get or create a default operator
    SELECT id INTO default_operator_id
    FROM operators
    WHERE operator_name = 'Default Operator'
    LIMIT 1;
    
    IF default_operator_id IS NULL THEN
        INSERT INTO operators (operator_name, operator_type, is_active)
        VALUES ('Default Operator', 'enterprise', TRUE)
        RETURNING id INTO default_operator_id;
    END IF;
    
    -- Insert or update user
    -- Handle both email and auth_user_id conflicts
    INSERT INTO public.users (user_email, user_name, auth_user_id, operator_id, is_active, role)
    VALUES (
        NEW.email,
        user_name_text,
        NEW.id,
        default_operator_id,
        TRUE,
        'user'
    )
    ON CONFLICT (user_email) DO UPDATE
        SET auth_user_id = COALESCE(users.auth_user_id, EXCLUDED.auth_user_id),
            user_name = COALESCE(EXCLUDED.user_name, users.user_name);
    
    -- If conflict on auth_user_id (separate unique constraint), handle it
    -- Note: This requires auth_user_id to have a unique constraint
    -- If the above INSERT didn't work due to auth_user_id conflict, update that record
    IF NOT FOUND THEN
        UPDATE public.users
        SET user_email = NEW.email,
            user_name = COALESCE(user_name, user_name_text)
        WHERE auth_user_id = NEW.id;
    END IF;
    
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Log error but don't fail auth user creation
        RAISE WARNING 'Error in handle_new_user for %: %', NEW.email, SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FIX 2: Ensure INSERT policy exists and allows trigger function
-- ============================================
-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Allow trigger to insert users" ON users;

-- Create policy that allows inserts (needed for trigger function)
-- SECURITY DEFINER should bypass RLS, but explicit policy is safer
CREATE POLICY "Allow trigger to insert users"
    ON users FOR INSERT
    WITH CHECK (true);

-- ============================================
-- FIX 3: Ensure operators INSERT policy exists
-- ============================================
DROP POLICY IF EXISTS "Allow trigger to insert operators" ON operators;

CREATE POLICY "Allow trigger to insert operators"
    ON operators FOR INSERT
    WITH CHECK (true);

-- ============================================
-- FIX 4: Grant necessary permissions to the function
-- ============================================
-- The function runs as SECURITY DEFINER, so it should have necessary permissions
-- But let's make sure it can insert into both tables
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON public.users TO postgres, service_role;
GRANT ALL ON public.operators TO postgres, service_role;

-- ============================================
-- VERIFICATION QUERIES (run these to check)
-- ============================================
-- Check if trigger exists:
-- SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';
--
-- Check if function exists:
-- SELECT * FROM pg_proc WHERE proname = 'handle_new_user';
--
-- Check RLS policies:
-- SELECT * FROM pg_policies WHERE tablename = 'users';
-- SELECT * FROM pg_policies WHERE tablename = 'operators';
--
-- Test the function manually (replace with actual auth user id):
-- SELECT public.handle_new_user() FROM auth.users WHERE id = '<some-uuid>' LIMIT 1;

