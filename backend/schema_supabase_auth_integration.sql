-- ============================================
-- SUPABASE AUTH INTEGRATION
-- ============================================
-- This script links Supabase Auth (auth.users) with the users and operators tables
-- Run this in your Supabase SQL Editor after enabling Auth
-- ============================================

-- ============================================
-- STEP 1: Add auth_user_id to users table
-- ============================================
-- Link users table to Supabase auth.users
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'auth_user_id'
    ) THEN
        ALTER TABLE users 
        ADD COLUMN auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE;
        
        COMMENT ON COLUMN users.auth_user_id IS 'Reference to Supabase auth.users.id';
    END IF;
END $$;

-- ============================================
-- STEP 2: Create function to sync auth user to users table
-- ============================================
-- This function creates a user record when a Supabase auth user signs up
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
    
    -- Get or create a default operator (you may want to customize this)
    SELECT id INTO default_operator_id
    FROM operators
    WHERE operator_name = 'Default Operator'
    LIMIT 1;
    
    -- If no default operator exists, create one
    IF default_operator_id IS NULL THEN
        INSERT INTO operators (operator_name, operator_type, is_active)
        VALUES ('Default Operator', 'enterprise', TRUE)
        RETURNING id INTO default_operator_id;
    END IF;
    
    -- Insert into users table
    -- Use ON CONFLICT to handle email conflicts (most common case)
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
    
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Log the error but don't fail the auth user creation
        RAISE WARNING 'Failed to create user profile for %: %', NEW.email, SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- STEP 3: Create trigger to auto-create user on signup
-- ============================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- STEP 4: Enable Row Level Security (RLS) on users table
-- ============================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policy: Allow trigger function to insert new users (SECURITY DEFINER bypasses RLS, but this is explicit)
CREATE POLICY "Allow trigger to insert users"
    ON users FOR INSERT
    WITH CHECK (true);

-- Policy: Users can read their own profile
CREATE POLICY "Users can view own profile"
    ON users FOR SELECT
    USING (auth_user_id = auth.uid());

-- Policy: Users can update their own profile
CREATE POLICY "Users can update own profile"
    ON users FOR UPDATE
    USING (auth_user_id = auth.uid());

-- ============================================
-- STEP 5: Enable RLS on operators table
-- ============================================
ALTER TABLE operators ENABLE ROW LEVEL SECURITY;

-- Policy: Allow trigger function to insert operators (for default operator creation)
CREATE POLICY "Allow trigger to insert operators"
    ON operators FOR INSERT
    WITH CHECK (true);

-- Policy: Users can view operators (for now, allow all authenticated users)
-- You may want to restrict this based on operator_id relationship
CREATE POLICY "Authenticated users can view operators"
    ON operators FOR SELECT
    TO authenticated
    USING (true);

-- ============================================
-- STEP 6: Enable RLS on compute_workloads table
-- ============================================
ALTER TABLE compute_workloads ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own workloads
CREATE POLICY "Users can view own workloads"
    ON compute_workloads FOR SELECT
    USING (
        user_id IN (
            SELECT id FROM users WHERE auth_user_id = auth.uid()
        )
    );

-- Policy: Users can insert their own workloads
CREATE POLICY "Users can insert own workloads"
    ON compute_workloads FOR INSERT
    WITH CHECK (
        user_id IN (
            SELECT id FROM users WHERE auth_user_id = auth.uid()
        )
    );

-- Policy: Users can update their own workloads
CREATE POLICY "Users can update own workloads"
    ON compute_workloads FOR UPDATE
    USING (
        user_id IN (
            SELECT id FROM users WHERE auth_user_id = auth.uid()
        )
    );

-- ============================================
-- STEP 7: Create helper function to get current user's profile
-- ============================================
CREATE OR REPLACE FUNCTION public.get_current_user_profile()
RETURNS TABLE (
    id UUID,
    user_email VARCHAR,
    user_name VARCHAR,
    role VARCHAR,
    operator_id UUID
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.id,
        u.user_email,
        u.user_name,
        u.role,
        u.operator_id
    FROM users u
    WHERE u.auth_user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- STEP 8: Create indexes for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_users_auth_user_id ON users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_workloads_user_id ON compute_workloads(user_id);

-- ============================================
-- NOTES:
-- ============================================
-- 1. After running this script, users who sign up via Supabase Auth will
--    automatically have a record created in the users table
-- 2. The default operator will be created if it doesn't exist
-- 3. You may want to customize the handle_new_user function to:
--    - Set specific roles based on email domain
--    - Assign users to specific operators
--    - Set default preferences
-- 4. To manually link an existing auth user to a user record:
--    UPDATE users SET auth_user_id = '<auth_user_id>' WHERE user_email = '<email>';
-- 5. Make sure to configure Supabase Auth settings:
--    - Enable Email/Password authentication
--    - Configure email templates (optional)
--    - Set up email confirmation (optional, recommended for production)

