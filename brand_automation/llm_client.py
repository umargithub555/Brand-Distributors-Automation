# """
# Thin wrapper around the Gemini API: retries, JSON extraction, logging.
# """

# import json
# import logging
# import re
# import time

# from google import genai
# from google.genai.types import Part

# import config

# log = logging.getLogger("form_filler.llm")

# _client = None


# def get_client():
#     global _client
#     if _client is None:
#         if not config.GEMINI_API_KEY:
#             raise RuntimeError(
#                 "BRAND_GEMINI_API_KEY is not set. Copy .env.example to .env and fill it in."
#             )
#         _client = genai.Client(api_key=config.GEMINI_API_KEY)
#     return _client


# def parse_json_response(raw: str) -> dict:
#     """Gemini sometimes wraps JSON in markdown fences or adds stray text — strip that."""
#     match = re.search(r"```(?:json)?\s*([\s\S]+?)```", raw)
#     if match:
#         raw = match.group(1).strip()
#     raw = raw.strip()
#     # Fallback: grab the first {...} block if there's leading/trailing prose.
#     if not raw.startswith("{"):
#         brace_match = re.search(r"\{[\s\S]*\}", raw)
#         if brace_match:
#             raw = brace_match.group(0)
#     return json.loads(raw)


# def call_gemini(contents: list, max_retries: int = 3, backoff_seconds: float = 2.0) -> dict:
#     """Call Gemini with the given contents, parse the JSON reply, retrying on failure."""
#     client = get_client()
#     last_err = None

#     for attempt in range(1, max_retries + 1):
#         try:
#             response = client.models.generate_content(
#                 model=config.GEMINI_MODEL,
#                 contents=contents,
#             )
#             return parse_json_response(response.text)
#         except json.JSONDecodeError as e:
#             last_err = e
#             log.warning("Attempt %d: Gemini returned unparseable JSON (%s)", attempt, e)
#         except Exception as e:
#             last_err = e
#             log.warning("Attempt %d: Gemini call failed (%s)", attempt, e)

#         if attempt < max_retries:
#             time.sleep(backoff_seconds * attempt)

#     raise RuntimeError(f"Gemini call failed after {max_retries} attempts: {last_err}")


# def analyze_via_dom(html: str, message: str, business_name: str) -> dict:
#     prompt = build_prompt(message, business_name)
#     contents = ["Analyze this webpage HTML carefully.\n\nHTML:\n" + html + "\n\n" + prompt]
#     return call_gemini(contents)


# def analyze_via_screenshot(screenshot_bytes: bytes, message: str, business_name: str) -> dict:
#     prompt = build_prompt(message, business_name)
#     contents = [
#         Part.from_bytes(data=screenshot_bytes, mime_type="image/png"),
#         "Analyze this webpage screenshot carefully.\n\n" + prompt,
#     ]
#     return call_gemini(contents)


# def verify_submission(screenshot_bytes: bytes) -> dict:
#     contents = [
#         Part.from_bytes(data=screenshot_bytes, mime_type="image/png"),
#         (
#             "Look at this webpage screenshot. Was a contact/inquiry form successfully "
#             "submitted? Look for confirmation text such as 'Thank you', 'Message sent', "
#             "'We received your request', or a visible error/validation message instead. "
#             "Return ONLY JSON, no markdown fences: "
#             '{"success": true, "confirmation_text": "what you see indicating success or failure"}'
#         ),
#     ]
#     return call_gemini(contents, max_retries=2)


# def build_prompt(message: str, business_name: str) -> str:
#     return f"""
# You are helping a human fill out (but NOT submit — a person will review first)
# a contact/inquiry form on behalf of:
#   Company : {config.COMPANY_NAME}
#   Email   : {config.CONTACT_EMAIL}
#   Name    : {config.CONTACT_PERSON}
#   Phone   : {config.PHONE_NUMBER}
#   Target business being contacted: {business_name}

# Message to send:
# {message}

# Return ONLY a valid JSON object (no explanation, no markdown fences) with exactly
# this structure:
# {{
#   "page_type": "contact_form" | "contact_link_only" | "not_relevant",
#   "captcha_detected": false,
#   "captcha_type": null,
#   "fields": [
#     {{
#       "label": "human readable label",
#       "selector": "css selector for the interactive element",
#       "field_type": "text" | "textarea" | "native_select" | "custom_dropdown" | "checkbox" | "radio",
#       "value": "value to fill, or option text to select, or true/false for checkbox",
#       "option_selector": "CSS selector for the option items ONLY if field_type is custom_dropdown, e.g. \\"[role='option']\\" or \\"li.dropdown-item\\" — otherwise omit"
#     }}
#   ],
#   "submit_selector": "css selector for the submit/continue button",
#   "required_fields_missing": ["label of any required field you could not confidently map"],
#   "notes": "anything a human reviewer should know before approving this"
# }}

# Field-type rules:
# - "native_select": a real HTML <select> element — value should be the visible option label.
# - "custom_dropdown": a div/button-based listbox or combobox that is NOT a real <select>
#   (clicking it opens a floating list of options). Set "selector" to the element that
#   must be CLICKED TO OPEN the list, "value" to the visible text of the option to pick,
#   and "option_selector" to a selector that will match the option elements once opened.
#   Nike-style listboxes and most design-system dropdowns (Material, Radix, custom divs
#   with role="listbox"/"option") are this type, NOT native_select.
# - "checkbox" / "radio": value is true or false (true = should be checked).
# - Only mark page_type "contact_form" if there's an actual fillable form on this page.
# - For name/full-name fields use: {config.CONTACT_PERSON}
# - For email fields use: {config.CONTACT_EMAIL}
# - For phone fields use: {config.PHONE_NUMBER}
# - For company/organization fields use: {config.COMPANY_NAME}
# - For subject fields use: {config.SUBJECT_LINE}
# - For message/textarea/description fields use the full message provided above
# - Prefer id or name attribute selectors over generic/positional ones
# - If a required field (marked with * or "required") can't be confidently mapped,
#   list its label in "required_fields_missing" rather than guessing — a wrong guess
#   can leave the submit button permanently disabled.
# - If a captcha is present, still list the form fields; the human reviewer will decide
#   whether to proceed.
# """









"""
Thin wrapper around the Gemini API: retries, JSON extraction, logging.
"""

import json
import logging
import re
import time

from google import genai
from google.genai.types import Part

import config

log = logging.getLogger("form_filler.llm")

_client = None


def get_client():
    global _client
    if _client is None:
        if not config.GEMINI_API_KEY:
            raise RuntimeError(
                "BRAND_GEMINI_API_KEY is not set. Copy .env.example to .env and fill it in."
            )
        _client = genai.Client(api_key=config.GEMINI_API_KEY)
    return _client


def parse_json_response(raw: str) -> dict:
    """Gemini sometimes wraps JSON in markdown fences or adds stray text — strip that."""
    match = re.search(r"```(?:json)?\s*([\s\S]+?)```", raw)
    if match:
        raw = match.group(1).strip()
    raw = raw.strip()
    # Fallback: grab the first {...} block if there's leading/trailing prose.
    if not raw.startswith("{"):
        brace_match = re.search(r"\{[\s\S]*\}", raw)
        if brace_match:
            raw = brace_match.group(0)
    return json.loads(raw)


def call_gemini(contents: list, max_retries: int = 3, backoff_seconds: float = 2.0) -> dict:
    """Call Gemini with the given contents, parse the JSON reply, retrying on failure."""
    client = get_client()
    last_err = None

    for attempt in range(1, max_retries + 1):
        try:
            response = client.models.generate_content(
                model=config.GEMINI_MODEL,
                contents=contents,
            )
            return parse_json_response(response.text)
        except json.JSONDecodeError as e:
            last_err = e
            log.warning("Attempt %d: Gemini returned unparseable JSON (%s)", attempt, e)
        except Exception as e:
            last_err = e
            log.warning("Attempt %d: Gemini call failed (%s)", attempt, e)

        if attempt < max_retries:
            time.sleep(backoff_seconds * attempt)

    raise RuntimeError(f"Gemini call failed after {max_retries} attempts: {last_err}")


def analyze_via_dom(html: str, message: str, business_name: str, iframe_blocks: list = None) -> dict:
    prompt = build_prompt(message, business_name)

    iframe_text = ""
    if iframe_blocks:
        iframe_text = (
            "\n\nThe following <iframe> element(s) were found embedded in the main page "
            "(common for Shopify contact-form apps like HulkApps, Gorgias, Typeform, etc). "
            "If a form field actually lives inside one of these iframes rather than the "
            "main page, set that field's \"iframe_selector\" to the selector shown below "
            "the corresponding block:\n"
        )
        for block in iframe_blocks:
            iframe_text += (
                f"\n--- Iframe content (iframe_selector: \"{block['selector']}\") ---\n"
                f"{block['html']}\n"
            )

    contents = [
        "Analyze this webpage HTML carefully.\n\nMain page HTML:\n" + html + iframe_text + "\n\n" + prompt
    ]
    return call_gemini(contents)


def analyze_via_screenshot(screenshot_bytes: bytes, message: str, business_name: str) -> dict:
    prompt = build_prompt(message, business_name)
    contents = [
        Part.from_bytes(data=screenshot_bytes, mime_type="image/png"),
        "Analyze this webpage screenshot carefully.\n\n" + prompt,
    ]
    return call_gemini(contents)


def verify_submission(screenshot_bytes: bytes) -> dict:
    contents = [
        Part.from_bytes(data=screenshot_bytes, mime_type="image/png"),
        (
            "Look at this webpage screenshot. Was a contact/inquiry form successfully "
            "submitted? Look for confirmation text such as 'Thank you', 'Message sent', "
            "'We received your request', or a visible error/validation message instead. "
            "Return ONLY JSON, no markdown fences: "
            '{"success": true, "confirmation_text": "what you see indicating success or failure"}'
        ),
    ]
    return call_gemini(contents, max_retries=2)


def build_prompt(message: str, business_name: str) -> str:
    return f"""
You are helping a human fill out (but NOT submit — a person will review first)
a contact/inquiry form on behalf of:
  Company : {config.COMPANY_NAME}
  Email   : {config.CONTACT_EMAIL}
  Name    : {config.CONTACT_PERSON}
  Phone   : {config.PHONE_NUMBER}
  Target business being contacted: {business_name}

Message to send:
{message}

Return ONLY a valid JSON object (no explanation, no markdown fences) with exactly
this structure:
{{
  "page_type": "contact_form" | "contact_link_only" | "not_relevant",
  "captcha_detected": false,
  "captcha_type": null,
  "fields": [
    {{
      "label": "human readable label",
      "selector": "css selector for the interactive element",
      "field_type": "text" | "textarea" | "native_select" | "custom_dropdown" | "checkbox" | "radio",
      "value": "value to fill, or option text to select, or true/false for checkbox",
      "option_selector": "CSS selector for the option items ONLY if field_type is custom_dropdown, e.g. \\"[role='option']\\" or \\"li.dropdown-item\\" — otherwise omit",
      "iframe_selector": "CSS selector for the <iframe> element (from the list below, if any) that this field lives inside — otherwise omit entirely for fields in the main page"
    }}
  ],
  "submit_selector": "css selector for the submit/continue button",
  "submit_iframe_selector": "same iframe_selector value as the fields, ONLY if the submit button is also inside that iframe — otherwise omit",
  "required_fields_missing": ["label of any required field you could not confidently map"],
  "notes": "anything a human reviewer should know before approving this"
}}

Field-type rules:
- "native_select": a real HTML <select> element — value should be the visible option label.
- "custom_dropdown": a div/button-based listbox or combobox that is NOT a real <select>
  (clicking it opens a floating list of options). Set "selector" to the element that
  must be CLICKED TO OPEN the list, "value" to the visible text of the option to pick,
  and "option_selector" to a selector that will match the option elements once opened.
  Nike-style listboxes and most design-system dropdowns (Material, Radix, custom divs
  with role="listbox"/"option") are this type, NOT native_select.
- "checkbox" / "radio": value is true or false (true = should be checked).
- Only mark page_type "contact_form" if there's an actual fillable form on this page.
- For name/full-name fields use: {config.CONTACT_PERSON}
- For email fields use: {config.CONTACT_EMAIL}
- For phone fields use: {config.PHONE_NUMBER}
- For company/organization fields use: {config.COMPANY_NAME}
- For subject fields use: {config.SUBJECT_LINE}
- For message/textarea/description fields use the full message provided above
- Prefer id or name attribute selectors over generic/positional ones
- If a required field (marked with * or "required") can't be confidently mapped,
  list its label in "required_fields_missing" rather than guessing — a wrong guess
  can leave the submit button permanently disabled.
- If a captcha is present, still list the form fields; the human reviewer will decide
  whether to proceed.
- IMPORTANT: if the real form fields are only visible inside an iframe block below (not
  in the main page HTML), you MUST set "iframe_selector" on every field that comes from
  that iframe, using its exact selector string as given. Never invent a selector for an
  iframe's internal fields against the main page — it will not be found there.
"""