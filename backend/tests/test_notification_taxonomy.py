"""Tests for the canonical notification taxonomy and the per-type matrix.

Covers:
  * category / priority resolution, including the legacy MEDIUM value
  * role visibility and role-scoped preference groups
  * the rule service's effective-channel resolution and cache invalidation
  * dispatch-time category assignment, dedupe, suppression and auditing
  * the scheme deadline processor, derived from application_end_date only

Outbound email/SMS is stubbed for every test that fans out to real recipients.
Without that, `process_scheme_expiry` would attempt a live Brevo call per
public user and the suite would hang on network timeouts.
"""

import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

from app.db.database import SessionLocal
from app.models.audit_log import AuditLog
from app.models.notification import Notification
from app.models.notification_preference import NotificationPreference
from app.models.notification_preference_rule import NotificationPreferenceRule
from app.models.scheme import Scheme
from app.models.user import User
from app.schemas.notification import NotificationCreate
from app.services import audit_log_service as audit
from app.services import notification_delivery_service as delivery
from app.services import notification_taxonomy as tax
from app.services import notification_service as ns
from app.services import scheme_expiry_service as expiry
from app.services.notification_preference_rule_service import (
    effective_matrix,
    replace_rules,
    resolve_channels,
    resolve_channels_for_user,
    upsert_rule,
)

#: Neutral, offline stand-ins for the two Brevo transports.
FAKE_EMAIL = {"success": True, "status_code": 200,
    "message_id": "test-email-id"}
FAKE_SMS = {"success": True, "status_code": 201, "message_id": "test-sms-id"}


def flat_preference(**overrides) -> NotificationPreference:
    """A permissive legacy preference row, for the pure resolver tests.

    Every topic and channel switch starts on so that only the flag under test
    can influence the resolved channels.
    """
    values = {
        "user_id": 1,
        "in_app_enabled": True,
        "email_enabled": True,
        "sms_enabled": False,
        "policy_alerts": True,
        "regulatory_updates": True,
        "scheme_updates": True,
        "deadline_reminders": True,
        "application_updates": True,
        "system_alerts": True,
    }
    values.update(overrides)
    return NotificationPreference(**values)


def group_for(notification_type: str) -> tax.PreferenceGroup:
    """The preference group that owns a notification type."""
    return next(g for g in tax.PREFERENCE_GROUPS if g.key == tax.group_key_for_type(notification_type))


class TestNotificationTaxonomy(unittest.TestCase):
    def test_every_documented_type_has_a_category(self):
        for notification_type, category in tax.TYPE_TO_CATEGORY.items():
            with self.subTest(type=notification_type):
                self.assertIsInstance(category, tax.NotificationCategory)

    def test_every_category_is_reachable(self):
        reachable = {c.value for c in tax.TYPE_TO_CATEGORY.values()}
        declared = {c.value for c in tax.NotificationCategory}
        self.assertEqual(reachable, declared)

    def test_category_lookup_for_unknown_type_falls_back_to_system(self):
        # A row written by an older deploy must still classify, and SYSTEM is
        # visible to every role, so it is the safe default.
        self.assertEqual(tax.resolve_category("SOMETHING_NEW"), "SYSTEM")
        self.assertEqual(tax.resolve_category(None), "SYSTEM")

    def test_priority_normalises_legacy_medium_to_normal(self):
        self.assertEqual(tax.normalize_priority("MEDIUM"),
                         tax.NotificationPriority.NORMAL.value)
        self.assertEqual(tax.normalize_priority("medium"),
                         tax.NotificationPriority.NORMAL.value)

    def test_priority_normalisation_passes_through_known_values(self):
        for value in ("LOW", "NORMAL", "HIGH", "URGENT"):
            with self.subTest(value=value):
                self.assertEqual(tax.normalize_priority(value), value)

    def test_priority_normalisation_handles_junk_without_raising(self):
        for value in (None, "", "  ", 123, "NOPE"):
            with self.subTest(value=value):
                self.assertEqual(tax.normalize_priority(
                    value), tax.NotificationPriority.NORMAL.value)

    def test_admin_request_types_are_marked_internal_only(self):
        for notification_type in tax.INTERNAL_ONLY_TYPES:
            with self.subTest(type=notification_type):
                self.assertTrue(tax.is_internal_only(notification_type))

    def test_public_roles_cannot_configure_internal_only_types(self):
        for role in tax.PUBLIC_ROLES:
            for notification_type in tax.INTERNAL_ONLY_TYPES:
                with self.subTest(role=role, type=notification_type):
                    self.assertFalse(
                        tax.role_can_configure_type(role, notification_type),
                        f"{role} must not be able to configure {notification_type}",
                    )

    def test_admin_can_configure_internal_only_types(self):
        for notification_type in tax.INTERNAL_ONLY_TYPES:
            with self.subTest(type=notification_type):
                self.assertTrue(tax.role_can_configure_type(
                    "ADMIN", notification_type))

    def test_role_scoped_groups_contain_no_internal_only_types(self):
        for role in tax.PUBLIC_ROLES:
            for group in tax.groups_for_role(role):
                for notification_type in group.types:
                    with self.subTest(role=role, type=notification_type):
                        self.assertFalse(
                            tax.is_internal_only(notification_type),
                            f"group {group.key} offers {role} the internal {notification_type}",
                        )

    def test_every_group_key_resolves_back_to_its_own_group(self):
        for group in tax.PREFERENCE_GROUPS:
            for notification_type in group.types:
                with self.subTest(key=group.key, type=notification_type):
                    self.assertEqual(tax.group_key_for_type(
                        notification_type), group.key)

    def test_every_group_is_reachable_by_at_least_one_role(self):
        for group in tax.PREFERENCE_GROUPS:
            with self.subTest(key=group.key):
                holders = [
                    r for r, keys in tax.ROLE_PREFERENCE_GROUPS.items() if group.key in keys]
                self.assertTrue(
                    holders, f"group {group.key} is offered to nobody")

    def test_internal_only_groups_are_not_reachable_by_public_roles(self):
        for group in tax.PREFERENCE_GROUPS:
            if not any(tax.is_internal_only(t) for t in group.types):
                continue
            with self.subTest(key=group.key):
                for role in tax.PUBLIC_ROLES:
                    self.assertNotIn(group.key, tax.allowed_group_keys(role))

    def test_known_types_matches_the_taxonomy(self):
        self.assertEqual(set(tax.known_types()), set(tax.TYPE_TO_CATEGORY))


class OfflineDeliveryMixin:
    """Guarantee no test in this file can reach Brevo.

    ``dispatch_notification`` runs the delivery pipeline synchronously, so a
    test that fans out to real recipients would otherwise make live API calls -
    which is what made the first run of this file hang until timeout. Both
    transports are stubbed for the duration of the class.
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._email_patch = mock.patch.object(
            delivery, "send_notification_email", return_value=FAKE_EMAIL
        )
        cls._sms_patch = mock.patch.object(
            delivery, "send_sms", return_value=FAKE_SMS)
        cls._email_patch.start()
        cls._sms_patch.start()

    @classmethod
    def tearDownClass(cls):
        cls._email_patch.stop()
        cls._sms_patch.stop()
        super().tearDownClass()


class TestPreferenceRuleService(OfflineDeliveryMixin, unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db = SessionLocal()
        cls.admin = cls.db.query(User).filter(
            User.role.in_(["ADMIN", "ADMINISTRATOR"])).first()
        cls.citizen = cls.db.query(User).filter(User.role == "CITIZEN").first()

    @classmethod
    def tearDownClass(cls):
        cls.db.close()

    def setUp(self):
        if not self.admin or not self.citizen:
            self.skipTest("seed users missing")
        self._clear_rules()
        ns.invalidate_preference_cache()

    def tearDown(self):
        self._clear_rules()
        ns.invalidate_preference_cache()

    def _clear_rules(self):
        self.db.query(NotificationPreferenceRule).filter(
            NotificationPreferenceRule.user_id.in_(
                [self.admin.user_id, self.citizen.user_id])
        ).delete(synchronize_session=False)
        self.db.commit()

    def _flat(self, user):
        return (
            self.db.query(NotificationPreference)
            .filter(NotificationPreference.user_id == user.user_id)
            .first()
        )

    def _rule(self, notification_type):
        return (
            self.db.query(NotificationPreferenceRule)
            .filter(
                NotificationPreferenceRule.user_id == self.citizen.user_id,
                NotificationPreferenceRule.notification_type == notification_type,
            )
            .first()
        )

    def _open_flat_preferences(self):
        """Make every legacy topic and channel switch permissive.

        The stored flat preferences gate group defaults, so they are pinned to
        a known-open state to keep these assertions independent of seed data.
        """
        for user in (self.admin, self.citizen):
            pref = self._flat(user)
            if pref is None:
                continue
            for flag in (
                "in_app_enabled",
                "email_enabled",
                "sms_enabled",
                "policy_alerts",
                "regulatory_updates",
                "scheme_updates",
                "deadline_reminders",
                "application_updates",
                "system_alerts",
            ):
                if hasattr(pref, flag):
                    setattr(pref, flag, True)
        self.db.commit()

    def test_effective_channels_fall_back_to_group_defaults(self):
        # preference=None bypasses the stored flat preference, so this asserts
        # the group default in isolation from whatever the seed data holds.
        channels = resolve_channels("POLICY_PUBLISHED", None)
        group = group_for("POLICY_PUBLISHED")
        self.assertEqual(channels, dict(group.default_channels))

    def test_explicit_rule_overrides_group_defaults(self):
        rule = NotificationPreferenceRule(
            user_id=self.citizen.user_id,
            notification_type="POLICY_PUBLISHED",
            group_key=tax.group_key_for_type("POLICY_PUBLISHED"),
            in_app_enabled=True,
            email_enabled=False,
            sms_enabled=True,
        )
        channels = resolve_channels("POLICY_PUBLISHED", None, rule)
        self.assertEqual(
            channels, {"in_app": True, "email": False, "sms": True})

    def test_partial_rule_leaves_untouched_channels_at_their_default(self):
        # upsert_rule materialises the group defaults for the channels the
        # caller does not mention, so a single toggle never silently drops the
        # other two.
        group = group_for("POLICY_PUBLISHED")
        upsert_rule(
            db=self.db,
            user_id=self.citizen.user_id,
            notification_type="POLICY_PUBLISHED",
            email_enabled=False,
        )
        self.db.commit()

        channels = resolve_channels(
            "POLICY_PUBLISHED", None, self._rule("POLICY_PUBLISHED"))
        self.assertFalse(channels["email"])
        self.assertEqual(channels["in_app"], group.default_channels["in_app"])
        self.assertEqual(channels["sms"], group.default_channels["sms"])

    def test_topical_flag_off_closes_every_channel(self):
        pref = flat_preference(
            **{"policy_alerts": False, "regulatory_updates": True})
        channels = resolve_channels("POLICY_PUBLISHED", pref)
        self.assertEqual(
            channels, {"in_app": False, "email": False, "sms": False})

    def test_global_master_switch_gates_every_channel(self):
        pref = flat_preference(**{"sms_enabled": False})
        channels = resolve_channels("POLICY_PUBLISHED", pref)
        self.assertTrue(channels["in_app"])
        self.assertTrue(channels["email"])
        self.assertFalse(channels["sms"])

    def test_unknown_type_falls_back_to_safe_defaults(self):
        channels = resolve_channels("SOMETHING_NEW", None)
        self.assertEqual(
            channels, {"in_app": True, "email": True, "sms": False})

    def test_for_user_resolution_agrees_with_the_pure_function(self):
        self._open_flat_preferences()
        upsert_rule(
            db=self.db,
            user_id=self.citizen.user_id,
            notification_type="POLICY_PUBLISHED",
            email_enabled=False,
        )
        self.db.commit()

        expected = resolve_channels("POLICY_PUBLISHED", self._flat(
            self.citizen), self._rule("POLICY_PUBLISHED"))
        actual = resolve_channels_for_user(
            self.db, self.citizen.user_id, "POLICY_PUBLISHED")
        self.assertEqual(actual, expected)
        self.assertFalse(actual["email"])

    def test_effective_matrix_only_returns_groups_the_role_may_configure(self):
        matrix = effective_matrix(self.db, self.citizen.user_id, "CITIZEN")
        self.assertEqual({g["key"] for g in matrix}, set(
            tax.allowed_group_keys("CITIZEN")))

    def test_effective_matrix_marks_only_explicitly_configured_types(self):
        upsert_rule(
            db=self.db,
            user_id=self.citizen.user_id,
            notification_type="POLICY_PUBLISHED",
            email_enabled=False,
        )
        self.db.commit()

        matrix = effective_matrix(self.db, self.citizen.user_id, "CITIZEN")
        explicit = {
            pref["notification_type"]
            for group in matrix
            for pref in group["type_preferences"]
            if pref["explicit"]
        }
        self.assertEqual(explicit, {"POLICY_PUBLISHED"})

    def test_matrix_covers_every_type_in_each_returned_group(self):
        matrix = effective_matrix(self.db, self.citizen.user_id, "CITIZEN")
        for group in matrix:
            with self.subTest(key=group["key"]):
                listed = {p["notification_type"]
                    for p in group["type_preferences"]}
                self.assertEqual(listed, set(group["types"]))

    def test_replace_rules_is_idempotent_on_the_same_type(self):
        payload = [
            {"notification_type": "POLICY_PUBLISHED", "email_enabled": False},
            {"notification_type": "SCHEME_PUBLISHED", "sms_enabled": True},
        ]
        replace_rules(self.db, self.citizen.user_id, payload)
        replace_rules(self.db, self.citizen.user_id, payload)
        self.db.commit()

        rows = (
            self.db.query(NotificationPreferenceRule)
            .filter(NotificationPreferenceRule.user_id == self.citizen.user_id)
            .count()
        )
        self.assertEqual(rows, 2)

    def test_repeated_type_within_one_payload_updates_instead_of_inserting(self):
        # Regression: the session runs with autoflush=False, so a read-then-insert
        # upsert could not see its own pending row and would trip
        # uq_pref_rule_user_type with a 500.
        replace_rules(
            self.db,
            self.citizen.user_id,
            [
                {"notification_type": "POLICY_PUBLISHED", "email_enabled": True},
                {"notification_type": "POLICY_PUBLISHED", "email_enabled": False},
            ],
        )
        self.db.commit()

        rows = (
            self.db.query(NotificationPreferenceRule)
            .filter(
                NotificationPreferenceRule.user_id == self.citizen.user_id,
                NotificationPreferenceRule.notification_type == "POLICY_PUBLISHED",
            )
            .all()
        )
        self.assertEqual(len(rows), 1)
        self.assertFalse(rows[0].email_enabled, "the last write must win")

    def test_new_rule_is_returned_with_an_identity(self):
        created = upsert_rule(
            db=self.db, user_id=self.citizen.user_id, notification_type="SCHEME_PUBLISHED"
        )
        self.db.commit()
        self.assertIsNotNone(created.rule_id)

    def test_rules_are_scoped_per_user(self):
        self._open_flat_preferences()
        upsert_rule(db=self.db, user_id=self.citizen.user_id,
                    notification_type="POLICY_PUBLISHED", email_enabled=False)
        upsert_rule(db=self.db, user_id=self.admin.user_id,
                    notification_type="POLICY_PUBLISHED", email_enabled=True)
        self.db.commit()

        self.assertFalse(
            resolve_channels_for_user(
                self.db, self.citizen.user_id, "POLICY_PUBLISHED")["email"]
        )
        self.assertTrue(
            resolve_channels_for_user(
                self.db, self.admin.user_id, "POLICY_PUBLISHED")["email"]
        )


class TestDispatchAndSuppression(OfflineDeliveryMixin, unittest.TestCase):
    #: Distinct entity ids so each test's rows cannot dedupe against another.
    ENTITY_BASE = 987654

    @classmethod
    def setUpClass(cls):
        cls.db = SessionLocal()
        cls.citizen = cls.db.query(User).filter(User.role == "CITIZEN").first()

    @classmethod
    def tearDownClass(cls):
        cls.db.close()

    def setUp(self):
        if not self.citizen:
            self.skipTest("seed citizen missing")
        self.db.query(NotificationPreferenceRule).filter(
            NotificationPreferenceRule.user_id == self.citizen.user_id
        ).delete(synchronize_session=False)
        self.db.commit()
        ns.invalidate_preference_cache()

    def tearDown(self):
        self.db.query(NotificationPreferenceRule).filter(
            NotificationPreferenceRule.user_id == self.citizen.user_id
        ).delete(synchronize_session=False)
        self.db.commit()
        self._cleanup_all()
        ns.invalidate_preference_cache()

    def _cleanup_all(self):
        self.db.query(Notification).filter(
            Notification.entity_id >= self.ENTITY_BASE,
            Notification.entity_type == "POLICY",
        ).delete(synchronize_session=False)
        self.db.commit()

    def _create(self, entity_id: int, **overrides):
        payload = dict(
            user_id=self.citizen.user_id,
            title="Probe",
            message="Probe",
            notification_type="POLICY_PUBLISHED",
            entity_type="POLICY",
            entity_id=entity_id,
        )
        payload.update(overrides)
        created = ns.dispatch_notification(
            self.db, NotificationCreate(**payload))
        self.db.commit()
        return created

    def test_dispatch_assigns_the_canonical_category(self):
        created = self._create(self.ENTITY_BASE + 1, priority="HIGH")
        self.assertIsNotNone(created)
        self.assertEqual(created.category, "POLICY")

    def test_dispatch_normalises_a_legacy_medium_priority(self):
        created = self._create(self.ENTITY_BASE + 2, priority="MEDIUM")
        self.assertIsNotNone(created)
        self.assertEqual(created.priority,
                         tax.NotificationPriority.NORMAL.value)

    def test_repeat_event_for_the_same_entity_is_deduped(self):
        first = self._create(self.ENTITY_BASE + 3)
        self.assertIsNotNone(first)

        second = self._create(self.ENTITY_BASE + 3)
        self.assertIsNone(
            second, "a duplicate event for the same entity must be deduped")

    def test_distinct_entities_are_not_deduped_against_each_other(self):
        self.assertIsNotNone(self._create(self.ENTITY_BASE + 4))
        self.assertIsNotNone(self._create(self.ENTITY_BASE + 5))

    def test_disabling_every_channel_suppresses_and_audits(self):
        upsert_rule(
            db=self.db,
            user_id=self.citizen.user_id,
            notification_type="POLICY_PUBLISHED",
            in_app_enabled=False,
            email_enabled=False,
            sms_enabled=False,
        )
        self.db.commit()
        ns.invalidate_preference_cache(self.citizen.user_id)

        audits_before = (
            self.db.query(AuditLog)
            .filter(AuditLog.action == audit.ACTION_NOTIFICATION_SUPPRESSED)
            .count()
        )

        created = self._create(self.ENTITY_BASE + 6)

        self.assertIsNone(
            created, "a notification with every channel off must be suppressed")
        audits_after = (
            self.db.query(AuditLog)
            .filter(AuditLog.action == audit.ACTION_NOTIFICATION_SUPPRESSED)
            .count()
        )
        self.assertEqual(audits_after, audits_before + 1,
                         "suppression must be auditable")

    def test_generation_is_audited(self):
        audits_before = (
            self.db.query(AuditLog)
            .filter(AuditLog.action == audit.ACTION_NOTIFICATION_GENERATED)
            .count()
        )
        self._create(self.ENTITY_BASE + 7)
        audits_after = (
            self.db.query(AuditLog)
            .filter(AuditLog.action == audit.ACTION_NOTIFICATION_GENERATED)
            .count()
        )
        self.assertEqual(audits_after, audits_before + 1)

    def test_in_app_suppression_is_cached_then_invalidated(self):
        upsert_rule(
            db=self.db,
            user_id=self.citizen.user_id,
            notification_type="POLICY_PUBLISHED",
            in_app_enabled=False,
        )
        self.db.commit()
        ns.invalidate_preference_cache(self.citizen.user_id)

        # Prime the cache with the rule in place.
        self.assertIn(
            "POLICY_PUBLISHED",
            ns.in_app_suppressed_types(
                self.db, self.citizen.user_id, "CITIZEN"),
        )

        # Without invalidation the stale answer would persist, which is exactly
        # the bug the invalidation hook exists to prevent.
        self.db.query(NotificationPreferenceRule).filter(
            NotificationPreferenceRule.user_id == self.citizen.user_id
        ).delete(synchronize_session=False)
        self.db.commit()
        ns.invalidate_preference_cache(self.citizen.user_id)

        self.assertNotIn(
            "POLICY_PUBLISHED",
            ns.in_app_suppressed_types(
                self.db, self.citizen.user_id, "CITIZEN"),
        )

    def test_invalidate_all_clears_every_users_cache(self):
        ns.in_app_suppressed_types(self.db, self.citizen.user_id, "CITIZEN")
        self.assertTrue(ns._SUPPRESSION_CACHE, "cache should be populated")
        ns.invalidate_preference_cache()
        self.assertFalse(ns._SUPPRESSION_CACHE)


class TestSchemeExpiryService(OfflineDeliveryMixin, unittest.TestCase):
    """The deadline processor is derived purely from ``application_end_date``.

    ``policies`` has no end-date column at all, so there is deliberately no
    policy counterpart to test here.
    """

    @classmethod
    def setUpClass(cls):
        cls.db = SessionLocal()
        cls.govt = (
            cls.db.query(User)
            .filter(User.role.in_(["GOVERNMENT_OFFICIAL", "GOVERNMENT_OFFICER"]))
            .first()
        )

    @classmethod
    def tearDownClass(cls):
        cls.db.close()

    def _make_scheme(self, days_until_end) -> Scheme:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        end = (
            None if days_until_end is None
            else now + timedelta(days=days_until_end)
        )
        scheme = Scheme(
            name=f"Expiry Probe {days_until_end}",
            description="Probe for the scheme deadline processor.",
            category="General",
            department="QA",
            ministry="QA",
            status="APPROVED",
            application_end_date=end,
            created_by=self.govt.user_id if self.govt else 1,
            created_at=now,
            updated_at=now,
        )
        self.db.add(scheme)
        self.db.commit()
        self.db.refresh(scheme)
        return scheme

    def _remove(self, scheme: Scheme) -> None:
        self.db.query(Notification).filter(
            Notification.entity_type == "SCHEME", Notification.entity_id == scheme.scheme_id
        ).delete(synchronize_session=False)
        self.db.delete(scheme)
        self.db.commit()

    def _types_created_for(self, scheme: Scheme) -> set[str]:
        return {
            row[0]
            for row in self.db.query(Notification.notification_type)
            .filter(
                Notification.entity_type == "SCHEME",
                Notification.entity_id == scheme.scheme_id,
            )
            .all()
        }

    def _count_for(self, scheme: Scheme, notification_type: str | None = None) -> int:
        query = self.db.query(Notification).filter(
            Notification.entity_type == "SCHEME",
            Notification.entity_id == scheme.scheme_id,
        )
        if notification_type:
            query = query.filter(
                Notification.notification_type == notification_type)
        return query.count()

    def test_thresholds_are_seven_three_and_one_day(self):
        self.assertEqual(expiry.REMINDER_THRESHOLDS_DAYS, (7, 3, 1))

    def test_scheme_seven_days_out_gets_a_reminder(self):
        scheme = self._make_scheme(days_until_end=7)
        try:
            expiry.process_scheme_expiry(self.db)
            self.db.commit()
            self.assertIn("SCHEME_ENDING", self._types_created_for(scheme))
            self.assertNotIn("SCHEME_ENDED", self._types_created_for(scheme))
        finally:
            self._remove(scheme)

    def test_scheme_three_days_out_gets_a_reminder(self):
        scheme = self._make_scheme(days_until_end=3)
        try:
            expiry.process_scheme_expiry(self.db)
            self.db.commit()
            self.assertIn("SCHEME_ENDING", self._types_created_for(scheme))
        finally:
            self._remove(scheme)

    def test_scheme_one_day_out_gets_a_reminder(self):
        scheme = self._make_scheme(days_until_end=1)
        try:
            expiry.process_scheme_expiry(self.db)
            self.db.commit()
            self.assertIn("SCHEME_ENDING", self._types_created_for(scheme))
        finally:
            self._remove(scheme)

    def test_scheme_far_from_its_deadline_gets_nothing(self):
        scheme = self._make_scheme(days_until_end=45)
        try:
            expiry.process_scheme_expiry(self.db)
            self.db.commit()
            self.assertEqual(self._types_created_for(scheme), set())
        finally:
            self._remove(scheme)

    def test_scheme_past_its_deadline_is_reported_as_ended(self):
        scheme = self._make_scheme(days_until_end=-2)
        try:
            expiry.process_scheme_expiry(self.db)
            self.db.commit()
            types = self._types_created_for(scheme)
            self.assertIn("SCHEME_ENDED", types)
            self.assertNotIn("SCHEME_ENDING", types)
        finally:
            self._remove(scheme)

    def test_scheme_without_a_deadline_is_ignored(self):
        scheme = self._make_scheme(days_until_end=None)
        try:
            expiry.process_scheme_expiry(self.db)
            self.db.commit()
            self.assertEqual(self._types_created_for(scheme), set())
        finally:
            self._remove(scheme)

    def test_processor_is_idempotent_within_a_day(self):
        scheme = self._make_scheme(days_until_end=7)
        try:
            expiry.process_scheme_expiry(self.db)
            self.db.commit()
            first_pass = self._count_for(scheme)
            self.assertGreater(first_pass, 0)

            expiry.process_scheme_expiry(self.db)
            self.db.commit()
            self.assertEqual(self._count_for(scheme), first_pass,
                             "a second pass must not re-notify")
        finally:
            self._remove(scheme)

    def test_ended_notice_is_emitted_at_most_once_ever(self):
        scheme = self._make_scheme(days_until_end=-1)
        try:
            expiry.process_scheme_expiry(self.db)
            self.db.commit()
            first_pass = self._count_for(scheme, "SCHEME_ENDED")
            self.assertGreater(first_pass, 0)

            expiry.process_scheme_expiry(self.db)
            self.db.commit()
            self.assertEqual(self._count_for(
                scheme, "SCHEME_ENDED"), first_pass)
        finally:
            self._remove(scheme)

    def test_processor_returns_a_summary(self):
        result = expiry.process_scheme_expiry(self.db)
        self.db.commit()
        self.assertIsInstance(result, dict)
        for key in (
            "schemes_evaluated",
            "ending_notifications",
            "ended_notifications",
            "thresholds_days",
        ):
            with self.subTest(key=key):
                self.assertIn(key, result)


if __name__ == "__main__":
    unittest.main()
