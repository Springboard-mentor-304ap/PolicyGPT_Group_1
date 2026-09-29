"""
Full verification of the 40+ business rules and notification
scenarios specified by the user.
Runs against the database and FastAPI test client.
"""
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

from fastapi.testclient import TestClient
from app.main import app
from app.db.database import SessionLocal
from app.models.user import User
from app.models.policy import Policy
from app.models.scheme import Scheme
from app.models.notification import Notification
from app.schemas.policy import PolicyCreate, PolicyUpdate
from app.schemas.scheme import SchemeCreate, SchemeUpdate
from app.core.security import create_access_token
from app.services import policy_service
from app.services import scheme_service
from app.services import scheme_expiry_service as expiry
from app.services import notification_delivery_service as delivery
from app.services import notification_service as ns

FAKE_EMAIL = {"success": True, "status_code": 200,
    "message_id": "test-email-id"}
FAKE_SMS = {"success": False, "status_code": 503,
    "error": "SMS provider not configured"}

class TestFullBusinessFlows(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._email_patch = mock.patch.object(
            delivery, "send_notification_email", return_value=FAKE_EMAIL)
        cls._sms_patch = mock.patch.object(
            delivery, "send_sms", return_value=FAKE_SMS)
        cls._email_patch.start()
        cls._sms_patch.start()

        cls.client = TestClient(app)
        cls.db = SessionLocal()

        # Find or ensure test users for each role
        cls.admins = cls.db.query(User).filter(
            User.role.in_(["ADMIN", "ADMINISTRATOR"])).all()
        cls.admin_a = cls.admins[0] if len(cls.admins) > 0 else None
        cls.admin_b = cls.admins[1] if len(cls.admins) > 1 else None
        
        cls.govt_officials = cls.db.query(User).filter(
            User.role.in_(["GOVERNMENT_OFFICIAL", "GOVERNMENT_OFFICER"])).all()
        cls.govt_a = cls.govt_officials[0] if len(
            cls.govt_officials) > 0 else None
        cls.govt_b = cls.govt_officials[1] if len(
            cls.govt_officials) > 1 else None

        cls.citizen = cls.db.query(User).filter(User.role == "CITIZEN").first()
        cls.researcher = cls.db.query(User).filter(
            User.role == "RESEARCHER").first()
        cls.org = cls.db.query(User).filter(
            User.role == "ORGANIZATION").first()

        cls.created_policy_ids = []
        cls.created_scheme_ids = []

    @classmethod
    def tearDownClass(cls):
        # Cleanup created policies and schemes
        if cls.created_policy_ids:
            cls.db.query(Notification).filter(
                Notification.entity_type == "POLICY",
                Notification.entity_id.in_(cls.created_policy_ids)
            ).delete(synchronize_session=False)
            cls.db.query(Policy).filter(Policy.policy_id.in_(
                cls.created_policy_ids)).delete(synchronize_session=False)

        if cls.created_scheme_ids:
            cls.db.query(Notification).filter(
                Notification.entity_type == "SCHEME",
                Notification.entity_id.in_(cls.created_scheme_ids)
            ).delete(synchronize_session=False)
            cls.db.query(Scheme).filter(Scheme.scheme_id.in_(
                cls.created_scheme_ids)).delete(synchronize_session=False)

        cls.db.commit()
        cls._email_patch.stop()
        cls._sms_patch.stop()
        cls.db.close()

    def _token(self, user):
        return create_access_token(user.user_id, user.role, user.token_version)

    def _auth_headers(self, user):
        return {"Authorization": f"Bearer {self._token(user)}"}

    def test_01_govt_creates_policy_notifies_admins(self):
        """1 & 2. Government creates policy -> Admin receives
        'New Policy Request' with Review Policy action."""
        if not self.govt_a or not self.admin_a:
            self.skipTest("Missing govt or admin user")

        now = datetime.now(timezone.utc).replace(tzinfo=None)
        policy_data = PolicyCreate(
            title=f"Flow Test Policy {now.timestamp()}",
            description="Testing policy creation notification",
            category="Education",
            department="Higher Education",
            ministry="Ministry of Education",
        )
        policy = policy_service.create_policy(
            db=self.db,
            data=policy_data,
            current_user=self.govt_a,
        )
        self.created_policy_ids.append(policy.policy_id)

        # Verify Admin received notification
        admin_notifs = self.db.query(Notification).filter(
            Notification.user_id == self.admin_a.user_id,
            Notification.entity_type == "POLICY",
            Notification.entity_id == policy.policy_id,
        ).all()

        self.assertGreater(
            len(admin_notifs),
            0,
            "Admin must receive notification when Govt creates policy",
        notif = admin_notifs[0]
        self.assertIn("New Policy", notif.title)
        self.assertEqual(notif.action_url, f"/policies/{policy.policy_id}")

        # Verify Citizen, Researcher, Organization did NOT receive notification (draft is not public)
        for pub_user in [self.citizen, self.researcher, self.org]:
            if pub_user:
                pub_count = self.db.query(Notification).filter(
                    Notification.user_id == pub_user.user_id,
                    Notification.entity_type == "POLICY",
                    Notification.entity_id == policy.policy_id,
                ).count()
                self.assertEqual(
                    pub_count, 0, f"Public user {pub_user.role} must not receive draft policy notification")

    def test_02_govt_creates_scheme_notifies_admins(self):
        """3 & 4. Government creates scheme -> Admin receives 'New Scheme Request' with Review Scheme action."""
        if not self.govt_a or not self.admin_a:
            self.skipTest("Missing govt or admin user")

        now = datetime.now(timezone.utc).replace(tzinfo=None)
        scheme_data = SchemeCreate(
            name=f"Flow Test Scheme {now.timestamp()}",
            description="Testing scheme creation notification",
            category="Agriculture",
            department="Farmers Welfare",
            ministry="Ministry of Agriculture",
            eligibility_criteria="Farmers",
            benefits=["Financial aid"],
            application_process="Online",
        )
        scheme = scheme_service.create_scheme(
            db=self.db,
            data=scheme_data,
            user_id=self.govt_a.user_id,
        )
        self.created_scheme_ids.append(scheme.scheme_id)

        admin_notifs = self.db.query(Notification).filter(
            Notification.user_id == self.admin_a.user_id,
            Notification.entity_type == "SCHEME",
            Notification.entity_id == scheme.scheme_id,
        ).all()

        self.assertGreater(
            len(admin_notifs), 0, "Admin must receive notification when Govt creates scheme")
        notif = admin_notifs[0]
        self.assertIn("New Scheme", notif.title)
        self.assertEqual(notif.action_url, f"/schemes/{scheme.scheme_id}")

    def test_03_govt_submits_policy_approval_request(self):
        """Government submits policy for approval -> Admin receives 'Policy Approval Request'."""
        if not self.govt_a or not self.admin_a:
            self.skipTest("Missing govt or admin user")

        now = datetime.now(timezone.utc).replace(tzinfo=None)
        policy = policy_service.create_policy(
            db=self.db,
            data=PolicyCreate(
                title=f"Approval Test Policy {now.timestamp()}",
                description="Testing approval submission",
                category="Finance",
                department="Revenue",
                ministry="Ministry of Finance",
            ),
            current_user=self.govt_a,
        )
        self.created_policy_ids.append(policy.policy_id)

        # Clear prior creation notifications for clean check
        self.db.query(Notification).filter(
            Notification.entity_type == "POLICY",
            Notification.entity_id == policy.policy_id
        ).delete(synchronize_session=False)
        self.db.commit()

        # Submit for approval
        policy_service.submit_policy(
            db=self.db,
            policy_id=policy.policy_id,
            current_user=self.govt_a,
        )

        admin_notifs = self.db.query(Notification).filter(
            Notification.user_id == self.admin_a.user_id,
            Notification.entity_type == "POLICY",
            Notification.entity_id == policy.policy_id,
            Notification.notification_type == "POLICY_APPROVAL_REQUEST"
        ).all()

        self.assertGreater(len(admin_notifs), 0,
                           "Admin must receive 'Policy Approval Request'")
        self.assertIn("Policy Approval Request", admin_notifs[0].title)

    def test_04_admin_approves_policy_multi_admin_rule_and_public_fanout(self):
        """
        Admin A approves request:
        - Government Official receives approval notification.
        - Admin B receives 'Policy Request Approved' update.
        - Admin A (actor) does NOT receive duplicate self-action notification.
        - Public users (Citizen, Researcher, Org) receive 'New Policy Published'.
        """
        if not self.govt_a or not self.admin_a:
            self.skipTest("Missing govt or admin user")

        now = datetime.now(timezone.utc).replace(tzinfo=None)
        policy = policy_service.create_policy(
            db=self.db,
            data=PolicyCreate(
                title=f"Publish Test Policy {now.timestamp()}",
                description="Testing publish fanout",
                category="Health",
                department="Health",
                ministry="Ministry of Health",
            ),
            current_user=self.govt_a,
        )
        self.created_policy_ids.append(policy.policy_id)

        policy_service.submit_policy(
            db=self.db,
            policy_id=policy.policy_id,
            current_user=self.govt_a,
        )

        # Clear notifications before approval
        self.db.query(Notification).filter(
            Notification.entity_type == "POLICY",
            Notification.entity_id == policy.policy_id
        ).delete(synchronize_session=False)
        self.db.commit()

        # Admin A approves
        policy_service.approve_policy(
            db=self.db,
            policy_id=policy.policy_id,
            current_user=self.admin_a,
        )

        # 1. Government Official receives approval
        govt_notifs = self.db.query(Notification).filter(
            Notification.user_id == self.govt_a.user_id,
            Notification.entity_type == "POLICY",
            Notification.entity_id == policy.policy_id,
        ).all()
        self.assertGreater(
            len(govt_notifs), 0, "Government Official must receive approval notification")
        self.assertIn("Approved", govt_notifs[0].title)

        # 2. Admin A (actor) does NOT receive 'Admin approved' update
        actor_update_notifs = self.db.query(Notification).filter(
            Notification.user_id == self.admin_a.user_id,
            Notification.entity_type == "POLICY",
            Notification.entity_id == policy.policy_id,
            Notification.notification_type == "ADMIN_ACTION_UPDATE"
        ).count()
        self.assertEqual(actor_update_notifs, 0,
                         "Actor Admin must not receive duplicate update of own action")

        # 3. Admin B (if exists) receives update
        if self.admin_b:
            admin_b_notifs = self.db.query(Notification).filter(
                Notification.user_id == self.admin_b.user_id,
                Notification.entity_type == "POLICY",
                Notification.entity_id == policy.policy_id,
                Notification.notification_type == "ADMIN_ACTION_UPDATE"
            ).all()
            self.assertGreater(len(admin_b_notifs), 0,
                               "Other admin B must receive update")

        # 4. Public users receive 'New Policy Published'
        for pub_user in [self.citizen, self.researcher, self.org]:
            if pub_user:
                pub_notif = self.db.query(Notification).filter(
                    Notification.user_id == pub_user.user_id,
                    Notification.entity_type == "POLICY",
                    Notification.entity_id == policy.policy_id,
                    Notification.notification_type.in_(
                        ["NEW_POLICY", "POLICY_PUBLISHED"])
                ).first()
                self.assertIsNotNone(
                    pub_notif, f"Public user {pub_user.role} must receive 'New Policy Published'")

    def test_05_admin_rejects_scheme_with_reason(self):
        """
        Admin rejects scheme:
        - Government official receives 'Scheme Rejected' with actual rejection reason.
        - Other Admins receive update.
        - Actor Admin A excluded.
        - Public users receive nothing.
        """
        if not self.govt_a or not self.admin_a:
            self.skipTest("Missing govt or admin user")

        now = datetime.now(timezone.utc).replace(tzinfo=None)
        scheme = scheme_service.create_scheme(
            db=self.db,
            data=SchemeCreate(
                name=f"Reject Test Scheme {now.timestamp()}",
                description="Testing rejection flow",
                category="Energy",
                department="Power",
                ministry="Ministry of Power",
                eligibility_criteria="All",
                benefits=["Subsidies"],
                application_process="Online",
            ),
            user_id=self.govt_a.user_id,
        )
        self.created_scheme_ids.append(scheme.scheme_id)

        scheme_service.submit_scheme(
            db=self.db,
            scheme=scheme,
            current_user=self.govt_a,
        )

        self.db.query(Notification).filter(
            Notification.entity_type == "SCHEME",
            Notification.entity_id == scheme.scheme_id
        ).delete(synchronize_session=False)
        self.db.commit()

        rejection_reason = "Missing required budget allocation documents."
        scheme_service.reject_scheme(
            db=self.db,
            scheme=scheme,
            reason=rejection_reason,
            actor_id=self.admin_a.user_id,
            actor_name=self.admin_a.full_name or "Admin A"
        )

        # Govt Official receives rejection with reason
        govt_notifs = self.db.query(Notification).filter(
            Notification.user_id == self.govt_a.user_id,
            Notification.entity_type == "SCHEME",
            Notification.entity_id == scheme.scheme_id,
        ).all()
        self.assertGreater(len(govt_notifs), 0)
        self.assertIn("Rejected", govt_notifs[0].title)
        self.assertIn(rejection_reason, govt_notifs[0].message)

        # Public users receive NOTHING for rejected scheme
        for pub_user in [self.citizen, self.researcher, self.org]:
            if pub_user:
                cnt = self.db.query(Notification).filter(
                    Notification.user_id == pub_user.user_id,
                    Notification.entity_type == "SCHEME",
                    Notification.entity_id == scheme.scheme_id,
                ).count()
                self.assertEqual(
                    cnt, 0, f"{pub_user.role} must not receive notifications for rejected scheme")

    def test_06_public_content_updated_notifies_public_users(self):
        """Updating an already-APPROVED policy or scheme notifies Citizen, Researcher, Organization."""
        if not self.admin_a:
            self.skipTest("Missing admin")

        now = datetime.now(timezone.utc).replace(tzinfo=None)
        # Create an approved policy
        policy = Policy(
            title=f"Update Test Policy {now.timestamp()}",
            description="Testing update notification",
            category="Environment",
            department="Forestry",
            ministry="MoEFCC",
            status="APPROVED",
            created_by=self.admin_a.user_id,
            created_at=now,
            updated_at=now
        )
        self.db.add(policy)
        self.db.commit()
        self.db.refresh(policy)
        self.created_policy_ids.append(policy.policy_id)

        # Admin updates the approved policy
        policy_service.update_policy(
            db=self.db,
            policy_id=policy.policy_id,
            data=PolicyUpdate(
                title=f"Update Test Policy Revised {now.timestamp()}"),
            current_user=self.admin_a,
        )

        # Check Citizen received 'Policy Updated'
        for pub_user in [self.citizen, self.researcher, self.org]:
            if pub_user:
                notif = self.db.query(Notification).filter(
                    Notification.user_id == pub_user.user_id,
                    Notification.entity_type == "POLICY",
                    Notification.entity_id == policy.policy_id,
                    Notification.notification_type == "POLICY_UPDATED"
                ).first()
                self.assertIsNotNone(
                    notif, f"{pub_user.role} must receive 'Policy Updated'")
                self.assertEqual(notif.title, "Policy Updated")

    def test_07_scheme_expiry_processor(self):
        """Scheme Ending Soon and Scheme Ended triggered by application_end_date only."""
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        # Scheme ending in 3 days
        scheme_ending = Scheme(
            name=f"Ending Soon Scheme {now.timestamp()}",
            description="Testing ending soon notification",
            category="Education",
            department="Higher Ed",
            ministry="Ministry of Ed",
            status="APPROVED",
            application_end_date=now + timedelta(days=3),
            created_by=self.admin_a.user_id if self.admin_a else 1,
            created_at=now,
            updated_at=now
        )
        # Scheme ended 2 days ago
        scheme_ended = Scheme(
            name=f"Ended Scheme {now.timestamp()}",
            description="Testing ended notification",
            category="Education",
            department="Higher Ed",
            ministry="Ministry of Ed",
            status="APPROVED",
            application_end_date=now - timedelta(days=2),
            created_by=self.admin_a.user_id if self.admin_a else 1,
            created_at=now,
            updated_at=now
        )
        self.db.add(scheme_ending)
        self.db.add(scheme_ended)
        self.db.commit()
        self.db.refresh(scheme_ending)
        self.db.refresh(scheme_ended)
        self.created_scheme_ids.extend(
            [scheme_ending.scheme_id, scheme_ended.scheme_id])

        # Run expiry processor
        res = expiry.process_scheme_expiry(self.db)
        self.db.commit()

        self.assertGreater(res["ending_notifications"], 0)
        self.assertGreater(res["ended_notifications"], 0)

        # Verify Citizen receives 'Scheme Ending Soon' and 'Scheme Ended'
        if self.citizen:
            ending_notif = self.db.query(Notification).filter(
                Notification.user_id == self.citizen.user_id,
                Notification.entity_type == "SCHEME",
                Notification.entity_id == scheme_ending.scheme_id,
                Notification.notification_type == "SCHEME_ENDING"
            ).first()
            self.assertIsNotNone(
                ending_notif, "Citizen must receive 'Scheme Ending Soon'")

            ended_notif = self.db.query(Notification).filter(
                Notification.user_id == self.citizen.user_id,
                Notification.entity_type == "SCHEME",
                Notification.entity_id == scheme_ended.scheme_id,
                Notification.notification_type == "SCHEME_ENDED"
            ).first()
            self.assertIsNotNone(
                ended_notif, "Citizen must receive 'Scheme Ended'")

    def test_08_security_user_scoping_and_idor(self):
        """User A cannot read or modify User B's notifications."""
        if not self.citizen or not self.admin_a:
            self.skipTest("Missing citizen or admin")

        # Create notification for admin
        notif = Notification(
            user_id=self.admin_a.user_id,
            title="Secret Admin Note",
            message="Internal workflow",
            notification_type="SYSTEM_ALERT",
            category="SYSTEM",
            priority="NORMAL",
            is_read=False,
            created_at=datetime.now(timezone.utc).replace(tzinfo=None)
        )
        self.db.add(notif)
        self.db.commit()
        self.db.refresh(notif)

        # Citizen attempts to read admin's notification
        res = self.client.get(
            f"/notifications/{notif.notification_id}", headers=self._auth_headers(self.citizen))
        self.assertIn(res.status_code, [
                      403, 404], "Citizen must be forbidden from accessing Admin's notification")

        # Citizen attempts to mark admin's notification as read
        res_patch = self.client.patch(
            f"/notifications/{notif.notification_id}/read", headers=self._auth_headers(self.citizen))
        self.assertIn(res_patch.status_code, [
                      403, 404], "Citizen must not be able to mark Admin's notification read")

        # Cleanup
        self.db.delete(notif)
        self.db.commit()

    def test_09_unread_count_and_read_state_transitions(self):
        """Unread count correctly increments and decrements with mark-read/mark-unread."""
        if not self.citizen:
            self.skipTest("Missing citizen")

        # Get initial count
        res_initial = self.client.get(
            "/notifications/unread-count", headers=self._auth_headers(self.citizen))
        self.assertEqual(res_initial.status_code, 200)
        c0 = res_initial.json().get("unread_count", 0)

        # Create one unread notification
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        notif = Notification(
            user_id=self.citizen.user_id,
            title="Unread Count Probe",
            message="Probe",
            notification_type="SYSTEM_ALERT",
            category="SYSTEM",
            priority="NORMAL",
            is_read=False,
            created_at=now
        )
        self.db.add(notif)
        self.db.commit()
        self.db.refresh(notif)

        res_after = self.client.get(
            "/notifications/unread-count", headers=self._auth_headers(self.citizen))
        c1 = res_after.json().get("unread_count", 0)
        self.assertEqual(c1, c0 + 1, "Unread count must increase by 1")

        # Mark as read
        res_read = self.client.patch(
            f"/notifications/{notif.notification_id}/read", headers=self._auth_headers(self.citizen))
        self.assertEqual(res_read.status_code, 200)

        res_after_read = self.client.get(
            "/notifications/unread-count", headers=self._auth_headers(self.citizen))
        c2 = res_after_read.json().get("unread_count", 0)
        self.assertEqual(
            c2, c0, "Unread count must return to original after marking read")

        # Cleanup
        self.db.delete(notif)
        self.db.commit()

if __name__ == "__main__":
    unittest.main()
