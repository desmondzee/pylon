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

def get_gemini_json_response(prompt: str, model_name: str = "gemini-2.0-flash-exp") -> dict:
    """
    Get a JSON response from Gemini model.
    Returns a dict, handling cases where response might be a list or other structure.
    """
    try:
        model = genai.GenerativeModel(model_name, generation_config={"response_mime_type": "application/json"})
        response = model.generate_content(prompt)
        parsed = json.loads(response.text)
        
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
    except json.JSONDecodeError as e:
        logger.error(f"JSON decode error: {e}, response text: {response.text[:200] if 'response' in locals() else 'N/A'}")
        return {"error": f"JSON decode error: {str(e)}"}
    except Exception as e:
        logger.error(f"Error calling Gemini API for JSON: {e}")
        return {"error": str(e)}

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
