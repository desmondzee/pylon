import os
import logging
import json
import google.generativeai as genai
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Load environment variables
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Initialize Supabase
supabase: Client = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info("Supabase client initialized")
    except Exception as e:
        logger.error(f"Failed to initialize Supabase: {e}")

# Initialize Gemini
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    logger.info("Gemini API configured")
else:
    logger.warning("GEMINI_API_KEY not found in environment variables")

def get_gemini_response(prompt: str, model_name: str = "gemini-2.0-flash-exp") -> str:
    """
    Get a response from Gemini model.
    """
    try:
        model = genai.GenerativeModel(model_name)
        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        logger.error(f"Error calling Gemini API: {e}")
        return f"Error: {str(e)}"

def get_gemini_json_response(prompt: str, model_name: str = "gemini-2.0-flash-exp", max_retries: int = 3) -> dict:
    """
    Get a JSON response from Gemini model with retry logic for rate limits and quota errors.
    Returns a dict, handling cases where response might be a list or other structure.
    """
    import time
    
    for attempt in range(max_retries):
        try:
            model = genai.GenerativeModel(model_name)
            
            # Add JSON instruction to prompt to ensure JSON response
            json_prompt = prompt
            if "Return a VALID JSON" not in prompt and "return JSON" not in prompt.lower():
                json_prompt = prompt + "\n\nIMPORTANT: Return ONLY valid JSON, no markdown formatting, no code blocks, no explanations. Just the raw JSON object."
            
            # Generate content
            response = model.generate_content(json_prompt)
            response_text = response.text.strip()
            
            # Remove markdown code blocks if present (```json or ```)
            if response_text.startswith("```"):
                lines = response_text.split("\n")
                # Remove first line if it's ```json or ```
                if lines[0].strip().startswith("```"):
                    lines = lines[1:]
                # Remove last line if it's ```
                if lines and lines[-1].strip() == "```":
                    lines = lines[:-1]
                response_text = "\n".join(lines).strip()
            
            # Parse JSON
            parsed = json.loads(response_text)
            
            # Handle case where Gemini returns a list instead of dict
            if isinstance(parsed, list):
                if len(parsed) > 0 and isinstance(parsed[0], dict):
                    logger.warning("Gemini returned a list, using first element")
                    return parsed[0]
                else:
                    logger.warning("Gemini returned an empty or invalid list, wrapping in dict")
                    return {"response": parsed, "error": "Unexpected list format"}
            
            # Ensure we return a dict
            if not isinstance(parsed, dict):
                logger.warning(f"Gemini returned non-dict type: {type(parsed)}, wrapping")
                return {"response": parsed, "error": "Unexpected response format"}
            
            return parsed
            
        except Exception as e:
            error_str = str(e)
            is_rate_limit = "429" in error_str or "quota" in error_str.lower() or "rate limit" in error_str.lower()
            
            # Check if error message contains retry delay information
            retry_delay = None
            if "retry_delay" in error_str or "seconds" in error_str:
                # Try to extract retry delay from error message
                import re
                delay_match = re.search(r'seconds[:\s]+(\d+)', error_str)
                if delay_match:
                    retry_delay = int(delay_match.group(1))
            
            if is_rate_limit and attempt < max_retries - 1:
                # Use extracted delay or exponential backoff
                wait_time = retry_delay if retry_delay else (30 * (2 ** attempt))  # 30s, 60s, 120s
                logger.warning(f"Gemini API rate limit/quota error (attempt {attempt + 1}/{max_retries}): {error_str[:200]}")
                logger.info(f"Waiting {wait_time} seconds before retry...")
                time.sleep(wait_time)
                continue
            elif isinstance(e, json.JSONDecodeError):
                logger.error(f"JSON decode error: {e}")
                # Try to extract JSON from text if it's wrapped
                try:
                    if 'response' in locals():
                        text = response.text
                        # Try to find JSON object in text
                        start = text.find('{')
                        end = text.rfind('}') + 1
                        if start >= 0 and end > start:
                            parsed = json.loads(text[start:end])
                            logger.info("Successfully extracted JSON from wrapped response")
                            return parsed
                except Exception as extract_error:
                    logger.error(f"Failed to extract JSON: {extract_error}")
                return {"error": f"JSON decode error: {str(e)}"}
            else:
                # Non-rate-limit error or final attempt
                logger.error(f"Error calling Gemini API for JSON: {e}")
                return {"error": str(e)}
    
    # All retries exhausted
    return {"error": "Max retries exceeded for Gemini API call"}

def log_agent_action(agent_name: str, action: str, details: dict):
    """
    Log agent action to Supabase.
    """
    if not supabase:
        logger.warning("Supabase not initialized, skipping log")
        return

    try:
        data = {
            "api_name": agent_name,
            "endpoint": action,
            "request_timestamp": "now()",
            "error_message": json.dumps(details)
        }
        supabase.table("api_logs").insert(data).execute()
    except Exception as e:
        logger.error(f"Failed to log agent action: {e}")
