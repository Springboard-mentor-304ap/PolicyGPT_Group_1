"""HTTP-level tests for the notifications API.

Reconstructed from the pytest node IDs in .pytest_cache after the original
file was lost. The names are preserved exactly so the node IDs match again.

Every test authenticates with a real JWT for a real seeded user. Outbound
Brevo traffic is stubbed for the whole module: `create_new_notification` runs
the delivery pipeline synchronously, so a live call here would both slow the
suite down and leak real email/SMS to seeded addresses.

Shared-database caveat
----------------------
These tests run against the configured PostgreSQL instance, not a throwaway
database, so the rows a test creates are cleaned up by title suffix but two
side effects on seeded data are not restored:

* ``test_mark_all_as_read`` marks every unread notification of the seeded
  citizen as read, so their unread count drops to 0 afterwards.
* ``test_get_and_update_preferences`` does restore the switch it flips.

Re-seed before relying on the unread count in manual testing.
"""

import unittest
from datetime import datetime, timezone
from unittest import mock

from fastapi.testclient import TestClient

from app.core.security import create_access_token
from app.db.database import SessionLocal
from app.main import app
from app.models.notification import Notification
from app.models.notification_preference import NotificationPreference
from app.models.notification_preference_rule import NotificationPreferenceRule
from app.models.user import User
from app.services import notification_delivery_service as delivery

FAKE_EMAIL = {"success": True, "status_code": 200,
    "message_id": "test-email-id"}
FAKE_SMS = {"success": True, "status_code": 201, "message_id": "test-sms-id"}

#: Suffix on every notification this module creates, so cleanup is exact even
#: though the tests run against a shared database.
TITLE_SUFFIX = "[pytest]"


def _first_user(session, role: str):
    return session.query(User).filter(User.role == role).first()


class TestNotificationModule(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._email_patch = mock.patch.object(
            delivery, "send_notification_email", return_value=FAKE_EMAIL
        )
        cls._sms_patch = mock.patch.object(
            delivery, "send_sms", return_value=FAKE_SMS)
        cls._email_patch.start()
        cls._sms_patch.start()

        cls.client = TestClient(app)
        cls.db = SessionLocal()

        cls.citizen = _first_user(cls.db, "CITIZEN")
        cls.researcher = _first_user(cls.db, "RESEARCHER")
        cls.admin = (
            cls.db.query(User).filter(User.role.in_(
                ["ADMIN", "ADMINISTRATOR"])).first()
        )
        if not (cls.citizen and cls.admin):
            raise unittest.SkipTest("seed users missing")

        cls.citizen_token = cls._token(cls.citizen)
        cls.researcher_token = cls._token(
            cls.researcher) if cls.researcher else None
        cls.admin_token = cls._token(cls.admin)

    @classmethod
    def tearDownClass(cls):
        cls._cleanup_all()
        cls._email_patch.stop()
        cls._sms_patch.stop()
        cls.db.close()

    @classmethod
    def _token(cls, user) -> str:
        return create_access_token(user.user_id, user.role, user.token_version)

    @classmethod
    def _headers(cls, token: str) -> dict:
        return {"Authorization": f"Bearer {token}"}

    @classmethod
    def _cleanup_all(cls):
        cls.db.query(Notification).filter(
            Notification.title.like(f"%{TITLE_SUFFIX}")
        ).delete(synchronize_session=False)
        cls.db.commit()

    def setUp(self):
        self._cleanup_all()

    def tearDown(self):
        self._cleanup_all()

    def _make_notification(self, user=None, read: bool = False, **overrides) -> Notification:
        user = user or self.citizen
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        payload = dict(
            user_id=user.user_id,
            title=f"Probe {TITLE_SUFFIX}",
            message="Probe body",
            notification_type="POLICY_PUBLISHED",
            category="POLICY",
            priority="NORMAL",
            entity_type="POLICY",
            is_read=read,
            created_at=now,
        )
        payload.update(overrides)
        row = Notification(**payload)
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return row

    # ------------------------------------------------------------------
    # Reads
    # ------------------------------------------------------------------

    def test_get_notifications_list(self):
        self._make_notification()
        response = self.client.get(
            "/notifications", headers=self._headers(self.citizen_token))
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("items", body)
        titles = [n["title"] for n in body["items"]]
        self.assertIn(f"Probe {TITLE_SUFFIX}", titles)

    def test_get_notifications_list_requires_auth(self):
        self.assertEqual(self.client.get("/notifications").status_code, 401)

    def test_unread_count_endpoint(self):
        self._make_notification(read=False)
        self._make_notification(read=False, title=f"Probe 2 {TITLE_SUFFIX}")
        response = self.client.get(
            "/notifications/unread-count", headers=self._headers(self.citizen_token)
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("unread_count", response.json())

    def test_notification_summary_endpoint(self):
        self._make_notification(read=False)
        response = self.client.get(
            "/notifications/summary", headers=self._headers(self.citizen_token)
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        for key in ("total", "unread", "read"):
            with self.subTest(key=key):
                self.assertIn(key, body)

    # ------------------------------------------------------------------
    # Read state
    # ------------------------------------------------------------------

    def test_mark_as_read_and_unread(self):
        row = self._make_notification(read=False)

        read = self.client.patch(
            f"/notifications/{row.notification_id}/read",
            headers=self._headers(self.citizen_token),
        )
        self.assertEqual(read.status_code, 200)
        self.db.refresh(row)
        self.assertTrue(row.is_read)

        unread = self.client.patch(
            f"/notifications/{row.notification_id}/unread",
            headers=self._headers(self.citizen_token),
        )
        self.assertEqual(unread.status_code, 200)
        self.db.refresh(row)
        self.assertFalse(row.is_read)

    def test_mark_all_as_read(self):
        self._make_notification(read=False)
        self._make_notification(read=False, title=f"Probe 2 {TITLE_SUFFIX}")

        response = self.client.patch(
            "/notifications/read-all", headers=self._headers(self.citizen_token)
        )
        self.assertEqual(response.status_code, 200)

        remaining = (
            self.db.query(Notification)
            .filter(
                Notification.user_id == self.citizen.user_id,
                Notification.title.like(f"%{TITLE_SUFFIX}"),
                Notification.is_read.is_(False),
            )
            .count()
        )
        self.assertEqual(remaining, 0)

    def test_delete_notification(self):
        row = self._make_notification()
        # Captured up front: touching the attribute after the delete would
        # refresh an identity-mapped instance whose row is gone.
        row_id = row.notification_id

        response = self.client.delete(
            f"/notifications/{row_id}", headers=self._headers(self.citizen_token)
        )
        self.assertIn(response.status_code, (200, 204))
        self.db.expire_all()
        self.assertIsNone(
            self.db.query(Notification)
            .filter(Notification.notification_id == row_id)
            .first()
        )

    # ------------------------------------------------------------------
    # Preferences
    # ------------------------------------------------------------------

    def test_get_and_update_preferences(self):
        get = self.client.get(
            "/notifications/preferences", headers=self._headers(self.citizen_token)
        )
        self.assertEqual(get.status_code, 200)
        original = get.json()

        update = self.client.put(
            "/notifications/preferences",
            headers=self._headers(self.citizen_token),
            json={"sms_enabled": not original.get("sms_enabled", False)},
        )
        self.assertEqual(update.status_code, 200)

        reread = self.client.get(
            "/notifications/preferences", headers=self._headers(self.citizen_token)
        )
        self.assertEqual(reread.status_code, 200)
        self.assertEqual(
            reread.json().get("sms_enabled"), not original.get("sms_enabled", False)
        )

        # Leave the shared row as we found it.
        self.client.put(
            "/notifications/preferences",
            headers=self._headers(self.citizen_token),
            json={"sms_enabled": original.get("sms_enabled", False)},
        )

    def test_reset_preferences(self):
        self.client.put(
            "/notifications/preferences",
            headers=self._headers(self.citizen_token),
            json={"email_enabled": False},
        )
        response = self.client.post(
            "/notifications/preferences/reset", headers=self._headers(self.citizen_token)
        )
        self.assertIn(response.status_code, (200, 204))

    # ------------------------------------------------------------------
    # Authorisation
    # ------------------------------------------------------------------

    def test_idor_security_restriction(self):
        victim = self.researcher or self.admin
        token = self.researcher_token if self.researcher else self.admin_token
        row = self._make_notification(user=victim)

        # A citizen must not be able to read another user's notification...
        forbidden_read = self.client.get(
            f"/notifications/{row.notification_id}", headers=self._headers(self.citizen_token)
        )
        self.assertIn(forbidden_read.status_code, (403, 404))

        # ...nor delete it.
        forbidden_delete = self.client.delete(
            f"/notifications/{row.notification_id}", headers=self._headers(self.citizen_token)
        )
        self.assertIn(forbidden_delete.status_code, (403, 404))

        self.db.expire_all()
        self.assertIsNotNone(
            self.db.query(Notification)
            .filter(Notification.notification_id == row.notification_id)
            .first(),
            "the victim's notification must survive",
        )
        del token

    def test_admin_statistics_and_permissions(self):
        forbidden = self.client.get(
            "/admin/notifications/statistics", headers=self._headers(self.citizen_token)
        )
        self.assertEqual(forbidden.status_code, 403)

        allowed = self.client.get(
            "/admin/notifications/statistics", headers=self._headers(self.admin_token)
        )
        self.assertEqual(allowed.status_code, 200)
        self.assertIsInstance(allowed.json(), dict)

    def test_admin_delivery_status_and_permissions(self):
        forbidden = self.client.get(
            "/admin/notifications/delivery-status", headers=self._headers(self.citizen_token)
        )
        self.assertEqual(forbidden.status_code, 403)

        allowed = self.client.get(
            "/admin/notifications/delivery-status", headers=self._headers(self.admin_token)
        )
        self.assertEqual(allowed.status_code, 200)
        self.assertIsInstance(allowed.json(), dict)

    def test_admin_test_email_and_sms(self):
        # A valid body is required: the role check lives inside the handler, so
        # an empty body would fail validation with 422 before it ever runs.
        for path, body in (
            ("/admin/notifications/test-email",
             {"email": "probe@example.invalid"}),
            ("/admin/notifications/test-sms",
             {"phone_number": "+919999999999"}),
        ):
            with self.subTest(path=path):
                forbidden = self.client.post(
                    path, headers=self._headers(self.citizen_token), json=body
                )
                self.assertEqual(forbidden.status_code, 403)

                allowed = self.client.post(
                    path, headers=self._headers(self.admin_token), json=body
                )
                self.assertIn(allowed.status_code, (200, 202))

    # ------------------------------------------------------------------
    # Event producers and callbacks
    # ------------------------------------------------------------------

    def test_event_trigger_policy_submitted(self):
        # Notification creation is restricted to ADMIN / GOVERNMENT_OFFICIAL,
        # so a citizen token is expected to be refused here.
        forbidden = self.client.post(
            "/notifications",
            headers=self._headers(self.citizen_token),
            json={
                "user_id": self.citizen.user_id,
                "title": f"Submitted {TITLE_SUFFIX}",
                "message": "Probe",
                "notification_type": "POLICY_PUBLISHED",
                "entity_type": "POLICY",
            },
        )
        self.assertEqual(forbidden.status_code, 403)

        response = self.client.post(
            "/notifications",
            headers=self._headers(self.admin_token),
            json={
                "user_id": self.citizen.user_id,
                "title": f"Submitted {TITLE_SUFFIX}",
                "message": "Probe",
                "notification_type": "POLICY_PUBLISHED",
                "entity_type": "POLICY",
            },
        )
        self.assertEqual(response.status_code, 201)
        body = response.json()
        row_id = body.get("notification_id") or body.get("id")
        self.assertIsNotNone(row_id)
        self.assertEqual(body.get("category"), "POLICY")

        self.db.expire_all()
        stored = (
            self.db.query(Notification)
            .filter(Notification.notification_id == row_id)
            .first()
        )
        self.assertIsNotNone(stored)
        self.assertEqual(stored.category, "POLICY")

    def test_brevo_webhooks(self):
        for path in ("/webhooks/brevo/email", "/webhooks/brevo/sms"):
            with self.subTest(path=path):
                response = self.client.post(
                    path,
                    json={"event": "delivered", "data": {
                        "message_id": "abc123"}},
                )
                self.assertEqual(response.status_code, 200)


class TestNotificationMatrixAtomicity(unittest.TestCase):
    """A rejected matrix save must not leave the master switches half-applied."""

    #: In the ADMIN_REQUEST category, so no public role may configure it.
    FORBIDDEN_TYPE = "POLICY_APPROVAL_REQUEST"

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.db = SessionLocal()
        cls.citizen = _first_user(cls.db, "CITIZEN")
        if not cls.citizen:
            raise unittest.SkipTest("seed citizen missing")
        cls.token = create_access_token(
            cls.citizen.user_id, cls.citizen.role, cls.citizen.token_version
        )

    @classmethod
    def tearDownClass(cls):
        cls._clear_rules()
        cls.db.close()

    @classmethod
    def _clear_rules(cls):
        cls.db.query(NotificationPreferenceRule).filter(
            NotificationPreferenceRule.user_id == cls.citizen.user_id
        ).delete(synchronize_session=False)
        cls.db.commit()

    def setUp(self):
        self._clear_rules()

    def tearDown(self):
        self._clear_rules()

    def _headers(self):
        return {"Authorization": f"Bearer {self.token}"}

    def _email_switch(self) -> bool:
        row = (
            self.db.query(NotificationPreference)
            .filter(NotificationPreference.user_id == self.citizen.user_id)
            .first()
        )
        return bool(row.email_enabled) if row else False

    def test_forbidden_rule_rejects_the_whole_save(self):
        before = self._email_switch()

        response = self.client.put(
            "/notification-preferences/me/matrix",
            headers=self._headers(),
            json={
                "global_settings": {"email_enabled": not before},
                "rules": [{"notification_type": self.FORBIDDEN_TYPE, "email_enabled": True}],
            },
        )
        self.assertEqual(response.status_code, 403)

        # The master switch must be untouched: the 403 has to abort the whole
        # transaction, not just skip the rules.
        self.db.expire_all()
        self.assertEqual(self._email_switch(), before)

        rules = (
            self.db.query(NotificationPreferenceRule)
            .filter(NotificationPreferenceRule.user_id == self.citizen.user_id)
            .count()
        )
        self.assertEqual(
            rules, 0, "no rule may be written for a rejected save")

    def test_permitted_save_applies_settings_and_rules(self):
        before = self._email_switch()

        response = self.client.put(
            "/notification-preferences/me/matrix",
            headers=self._headers(),
            json={
                "global_settings": {"email_enabled": not before},
                "rules": [{"notification_type": "POLICY_PUBLISHED", "sms_enabled": True}],
            },
        )
        self.assertEqual(response.status_code, 200)

        self.db.expire_all()
        self.assertEqual(self._email_switch(), not before)
        rule = (
            self.db.query(NotificationPreferenceRule)
            .filter(
                NotificationPreferenceRule.user_id == self.citizen.user_id,
                NotificationPreferenceRule.notification_type == "POLICY_PUBLISHED",
            )
            .first()
        )
        self.assertIsNotNone(rule)
        self.assertTrue(rule.sms_enabled)

        # Restore.
        self.client.put(
            "/notification-preferences/me/matrix",
            headers=self._headers(),
            json={"global_settings": {"email_enabled": before}},
        )


if __name__ == "__main__":
    unittest.main()
