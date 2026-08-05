from __future__ import annotations


def classify_smtp_error(error_message: str | None) -> str:
    message = (error_message or '').lower()
    if not message:
        return 'unknown'
    if '5.1.1' in message or 'no such user' in message or 'does not exist' in message or 'address couldn\'t be found' in message:
        return 'address_not_found'
    if 'mailbox unavailable' in message or '5.2.1' in message or 'unable to receive mail' in message:
        return 'mailbox_unavailable'
    if 'authentication' in message or 'auth' in message or '535' in message:
        return 'authentication_failed'
    if 'timed out' in message or 'timeout' in message:
        return 'timeout'
    if 'rate limit' in message or 'too many' in message or '421' in message:
        return 'rate_limited'
    if 'blocked' in message or 'policy' in message or 'spam' in message or 'blacklist' in message:
        return 'policy_blocked'
    if 'connection' in message or 'unreachable' in message or 'refused' in message or 'network' in message:
        return 'connection_failed'
    if 'invalid' in message and 'address' in message:
        return 'invalid_address'
    return 'unknown'


def humanize_error_type(error_type: str | None) -> str:
    mapping = {
        'address_not_found': 'Address not found',
        'mailbox_unavailable': 'Mailbox unavailable',
        'authentication_failed': 'Authentication failed',
        'timeout': 'Timeout',
        'rate_limited': 'Rate limited',
        'policy_blocked': 'Policy blocked',
        'connection_failed': 'Connection failed',
        'invalid_address': 'Invalid address',
        'unknown': 'Unknown error',
    }
    return mapping.get(error_type or 'unknown', 'Unknown error')
