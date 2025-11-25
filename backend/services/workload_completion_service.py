"""
Workload Completion Service - Automatically marks workloads as completed after runtime elapses.

This service:
1. Polls Supabase for all non-completed workloads
2. Checks if created_at + runtime_hours (or estimated_duration_hours) has elapsed
3. Updates status to 'completed' and sets actual_end timestamp

This approach works even when the head agent isn't running continuously, making it ideal for development.
"""

import os
import time
import logging
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
from agent_utils import supabase

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
POLL_INTERVAL = int(os.getenv('WORKLOAD_COMPLETION_POLL_INTERVAL', '60'))  # Check every minute
MAX_WORKLOADS_PER_CYCLE = int(os.getenv('MAX_COMPLETION_WORKLOADS_PER_CYCLE', '50'))

logger.info(f"Workload Completion Service initialized (poll interval: {POLL_INTERVAL}s)")


def check_and_complete_workloads():
    """Check all non-completed workloads and mark them as completed if runtime has elapsed since creation."""
    if not supabase:
        logger.error("Supabase client not initialized")
        return
    
    try:
        # Query for all non-completed workloads (pending, scheduled, queued, running, etc.)
        # Exclude completed, cancelled, and deferred statuses
        result = supabase.table("compute_workloads")\
            .select("id, workload_name, status, created_at, runtime_hours, estimated_duration_hours")\
            .not_.in_("status", ["completed", "cancelled", "deferred"])\
            .not_.is_("created_at", "null")\
            .order("created_at", desc=False)\
            .limit(MAX_WORKLOADS_PER_CYCLE)\
            .execute()
        
        if not result.data:
            logger.debug("No non-completed workloads found to check")
            return
        
        logger.info(f"Checking {len(result.data)} non-completed workload(s) for completion")
        now = datetime.now(timezone.utc)
        completed_count = 0
        
        for workload in result.data:
            workload_id = workload.get('id')
            workload_name = workload.get('workload_name', 'Unnamed Workload')
            status = workload.get('status', 'unknown')
            created_at_str = workload.get('created_at')
            runtime_hours = workload.get('runtime_hours')
            estimated_duration_hours = workload.get('estimated_duration_hours')
            
            if not created_at_str:
                logger.debug(f"[{workload_id}] Skipping - no created_at timestamp")
                continue
            
            # Parse created_at timestamp
            try:
                created_at = datetime.fromisoformat(created_at_str.replace('Z', '+00:00'))
            except Exception as e:
                logger.warning(f"[{workload_id}] Could not parse created_at: {e}")
                continue
            
            # Determine runtime (prefer runtime_hours, fallback to estimated_duration_hours)
            runtime = runtime_hours if runtime_hours is not None else estimated_duration_hours
            
            if runtime is None or runtime <= 0:
                logger.debug(f"[{workload_id}] Skipping - no valid runtime (runtime_hours={runtime_hours}, estimated_duration_hours={estimated_duration_hours})")
                continue
            
            # Calculate expected completion time based on creation time
            expected_completion = created_at + timedelta(hours=float(runtime))
            
            # Check if runtime has elapsed since creation
            if now >= expected_completion:
                logger.info(f"[{workload_id}] Runtime elapsed since creation - marking as completed")
                logger.info(f"  Workload: {workload_name}")
                logger.info(f"  Status: {status}")
                logger.info(f"  Created: {created_at.isoformat()}")
                logger.info(f"  Runtime: {runtime} hours")
                logger.info(f"  Expected completion: {expected_completion.isoformat()}")
                logger.info(f"  Current time: {now.isoformat()}")
                
                try:
                    # Update workload to completed
                    # Only set actual_end if it's not already set (preserve real completion time if set)
                    update_data = {
                        "status": "completed",
                        "updated_at": now.isoformat()
                    }
                    
                    # Only set actual_end if it's not already set
                    existing_workload = supabase.table("compute_workloads")\
                        .select("actual_end")\
                        .eq("id", workload_id)\
                        .single()\
                        .execute()
                    
                    if existing_workload.data and not existing_workload.data.get('actual_end'):
                        update_data["actual_end"] = now.isoformat()
                    
                    update_result = supabase.table("compute_workloads").update(update_data).eq("id", workload_id).execute()
                    
                    if update_result.data:
                        completed_count += 1
                        logger.info(f"[{workload_id}] ✓ Successfully marked as completed")
                    else:
                        logger.warning(f"[{workload_id}] Update returned no data")
                        
                except Exception as e:
                    logger.error(f"[{workload_id}] Error updating to completed: {e}", exc_info=True)
            else:
                # Log remaining time for debugging
                remaining = expected_completion - now
                logger.debug(f"[{workload_id}] Still active - {remaining.total_seconds()/3600:.2f} hours remaining (status: {status})")
        
        if completed_count > 0:
            logger.info(f"✓ Completed {completed_count} workload(s)")
            
    except Exception as e:
        logger.error(f"Error checking workloads for completion: {e}", exc_info=True)


def main():
    """Main polling loop."""
    logger.info("Starting Workload Completion Service polling loop")
    logger.info(f"Poll interval: {POLL_INTERVAL} seconds")
    logger.info(f"Max workloads per cycle: {MAX_WORKLOADS_PER_CYCLE}")
    
    while True:
        try:
            check_and_complete_workloads()
        except KeyboardInterrupt:
            logger.info("Received interrupt signal, shutting down...")
            break
        except Exception as e:
            logger.error(f"Error in polling loop: {e}", exc_info=True)
        
        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()

