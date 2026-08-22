import time
from typing import Dict, Tuple

# Stores mapping of phone_number -> (otp_code, expires_at_timestamp)
OTP_STORE: Dict[str, Tuple[str, float]] = {}

def generate_mock_otp(phone: str) -> str:
    """
    Generates a mock OTP for the given phone number.
    Always uses '1432' for demonstration purposes.
    """
    code = "1432"
    # Expires in 5 minutes
    expires_at = time.time() + 300 
    OTP_STORE[phone] = (code, expires_at)
    return code

def verify_otp(phone: str, code: str) -> bool:
    """
    Verifies the OTP code for the given phone number.
    Returns True if valid and unexpired, False otherwise.
    """
    if phone not in OTP_STORE:
        return False
        
    stored_code, expires_at = OTP_STORE[phone]
    
    # Check expiration
    if time.time() > expires_at:
        del OTP_STORE[phone]
        return False
        
    # Check code match
    if stored_code == code:
        del OTP_STORE[phone] # Single use
        return True
        
    return False
