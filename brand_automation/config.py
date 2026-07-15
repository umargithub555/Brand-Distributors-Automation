"""
Configuration for the outreach form-filler.
Edit the values below (or override via a .env file — see .env.example).
"""

import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# ── Sender identity ──────────────────────────────────────────────
COMPANY_NAME   = os.getenv("COMPANY_NAME", "IR Solutions")
CONTACT_EMAIL  = os.getenv("CONTACT_EMAIL", "contact@irsolutions.com")
CONTACT_PERSON = os.getenv("CONTACT_PERSON", "IR Solutions Team")
PHONE_NUMBER   = os.getenv("PHONE_NUMBER", "+1-800-000-0000")

# {business} is filled in per-row from businesses.csv
MESSAGE_TEMPLATE = (
    "Hello,\n\n"
    "My name is {name} from {company}. We provide door-to-door and "
    "business-to-business service outreach, and we'd like to explore "
    "whether a partnership with {business} makes sense.\n\n"
    "If this isn't the right channel for this kind of inquiry, we'd "
    "appreciate being pointed to the right contact — happy to follow "
    "up by email instead: {email}.\n\n"
    "Best regards,\n"
    "{name}\n"
    "{company}"
)

SUBJECT_LINE = "Partnership Inquiry"

# ── Paths ─────────────────────────────────────────────────────────
BASE_DIR         = Path(__file__).parent
SCREENSHOTS_DIR  = BASE_DIR / "screenshots"
RESULTS_FILE     = BASE_DIR / "results.json"
BUSINESSES_CSV   = BASE_DIR / "businesses.csv"
LOG_FILE         = BASE_DIR / "run.log"

SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)

# ── LLM ───────────────────────────────────────────────────────────
GEMINI_API_KEY = os.getenv("BRAND_GEMINI_API_KEY")
GEMINI_MODEL   = os.getenv("GEMINI_MODEL", "gemini-3-flash-preview")

# ── Behavior ──────────────────────────────────────────────────────
# Every filled form is shown to a human before submission.
# This cannot be disabled from the CLI — it's the safety checkpoint
# that keeps this a reviewed-outreach tool rather than a blind bot.
REQUIRE_HUMAN_APPROVAL = True

NAV_TIMEOUT_MS    = 30_000
FIELD_TIMEOUT_MS  = 6_000
POST_SUBMIT_WAIT_MS = 3_000


def get_message(business_name: str) -> str:
    return MESSAGE_TEMPLATE.format(
        name=CONTACT_PERSON,
        company=COMPANY_NAME,
        email=CONTACT_EMAIL,
        business=business_name,
    )
