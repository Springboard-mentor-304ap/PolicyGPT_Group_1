"""Regression test for the notification-preference matrix 500.

Every ``PreferenceGroup`` description in ``notification_taxonomy.py`` was a
1-tuple instead of a string: implicit string concatenation wrapped in
parentheses with a trailing comma, e.g. ``("a " "b",)``. Pydantic then
rejected ``groups.*.description`` during response validation, so
``GET /notification-preferences/me/matrix`` returned HTTP 500 for every
role and the preferences page could never sync.

These tests need no database: they assert the taxonomy literals have the
right types and validate against the real response schema.
"""

from app.schemas.notification_preference import (
    NotificationPreferenceGroupResponse,
)
from app.services import notification_taxonomy as tax


def test_all_group_descriptions_are_strings():
    assert tax.PREFERENCE_GROUPS
    for group in tax.PREFERENCE_GROUPS:
        assert isinstance(group.description, str), group.key
        assert isinstance(group.label, str), group.key
        assert isinstance(group.key, str), group.key


def test_all_groups_validate_against_response_schema():
    for group in tax.PREFERENCE_GROUPS:
        payload = {
            **group.as_dict(),
            "type_preferences": [
                {
                    "notification_type": notification_type,
                    "in_app_enabled": True,
                    "email_enabled": True,
                    "sms_enabled": False,
                    "explicit": False,
                }
                for notification_type in group.types
            ],
        }
        parsed = NotificationPreferenceGroupResponse.model_validate(payload)
        assert parsed.description == group.description
        assert parsed.key == group.key
