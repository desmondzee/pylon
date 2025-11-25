-- ============================================
-- MANUALLY LINK EXISTING AUTH USERS
-- ============================================
-- If you created users in Supabase Auth before running the trigger,
-- use this script to link them to the users table
-- ============================================

-- Step 1: Create default operator if it doesn't exist
INSERT INTO operators (operator_name, operator_type, is_active)
SELECT 'Default Operator', 'enterprise', TRUE
WHERE NOT EXISTS (
    SELECT 1 FROM operators WHERE operator_name = 'Default Operator'
);

-- Step 2: Get the default operator ID
DO $$
DECLARE
    default_operator_id UUID;
    auth_user_record RECORD;
BEGIN
    -- Get default operator
    SELECT id INTO default_operator_id
    FROM operators
    WHERE operator_name = 'Default Operator'
    LIMIT 1;
    
    -- Loop through all auth users that don't have a profile
    FOR auth_user_record IN
        SELECT 
            au.id as auth_user_id,
            au.email,
            COALESCE(
                au.raw_user_meta_data->>'name',
                au.raw_user_meta_data->>'full_name',
                split_part(au.email, '@', 1)
            ) as user_name
        FROM auth.users au
        WHERE NOT EXISTS (
            SELECT 1 FROM users u WHERE u.auth_user_id = au.id
        )
    LOOP
        -- Insert user profile
        INSERT INTO users (
            user_email,
            user_name,
            auth_user_id,
            operator_id,
            role,
            is_active
        )
        VALUES (
            auth_user_record.email,
            auth_user_record.user_name,
            auth_user_record.auth_user_id,
            default_operator_id,
            'user',  -- Default role, change to 'operator' if needed
            TRUE
        )
        ON CONFLICT (user_email) DO UPDATE
            SET auth_user_id = COALESCE(users.auth_user_id, EXCLUDED.auth_user_id);
        
        RAISE NOTICE 'Linked auth user % to users table', auth_user_record.email;
    END LOOP;
END $$;

-- Step 3: Verify the linking
SELECT 
    au.id as auth_user_id,
    au.email,
    u.id as user_id,
    u.user_name,
    u.role
FROM auth.users au
LEFT JOIN users u ON u.auth_user_id = au.id
ORDER BY au.created_at DESC;

-- ============================================
-- MANUALLY LINK A SPECIFIC USER
-- ============================================
-- If you want to link a specific user, use this:
/*
DO $$
DECLARE
    default_operator_id UUID;
    auth_user_email VARCHAR := 'user@example.com';
    auth_user_id UUID;
BEGIN
    -- Get auth user ID
    SELECT id INTO auth_user_id
    FROM auth.users
    WHERE email = auth_user_email;
    
    IF auth_user_id IS NULL THEN
        RAISE EXCEPTION 'Auth user with email % not found', auth_user_email;
    END IF;
    
    -- Get default operator
    SELECT id INTO default_operator_id
    FROM operators
    WHERE operator_name = 'Default Operator'
    LIMIT 1;
    
    -- Create operator if needed
    IF default_operator_id IS NULL THEN
        INSERT INTO operators (operator_name, operator_type, is_active)
        VALUES ('Default Operator', 'enterprise', TRUE)
        RETURNING id INTO default_operator_id;
    END IF;
    
    -- Insert or update user
    INSERT INTO users (
        user_email,
        user_name,
        auth_user_id,
        operator_id,
        role,
        is_active
    )
    VALUES (
        auth_user_email,
        split_part(auth_user_email, '@', 1),
        auth_user_id,
        default_operator_id,
        'user',  -- Change to 'operator' if needed
        TRUE
    )
    ON CONFLICT (user_email) DO UPDATE
        SET auth_user_id = COALESCE(users.auth_user_id, EXCLUDED.auth_user_id);
    
    RAISE NOTICE 'Successfully linked user %', auth_user_email;
END $$;
*/

