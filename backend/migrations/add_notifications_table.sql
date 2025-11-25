-- ============================================
-- NOTIFICATIONS TABLE
-- ============================================
-- Stores notifications for users when operators take actions on their workloads
-- ============================================

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workload_id UUID REFERENCES compute_workloads(id) ON DELETE SET NULL,
    notification_type VARCHAR(50) NOT NULL, -- 'workload_paused', 'workload_cancelled', 'workload_resumed', 'workload_updated'
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    action_taken VARCHAR(100), -- 'paused', 'cancelled', 'resumed', etc.
    operator_id UUID REFERENCES operators(id) ON DELETE SET NULL,
    operator_name VARCHAR(255), -- Cached operator name for display
    read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB, -- Additional context (workload name, status, etc.)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_workload_id ON notifications(workload_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read) WHERE read = FALSE;

-- Add comments
COMMENT ON TABLE notifications IS 'User notifications for operator actions on workloads';
COMMENT ON COLUMN notifications.notification_type IS 'Type of notification: workload_paused, workload_cancelled, workload_resumed, workload_updated';
COMMENT ON COLUMN notifications.action_taken IS 'The action that was taken by the operator';
COMMENT ON COLUMN notifications.operator_name IS 'Cached operator name for display (avoids joins)';
COMMENT ON COLUMN notifications.metadata IS 'Additional context like workload name, previous status, etc.';

