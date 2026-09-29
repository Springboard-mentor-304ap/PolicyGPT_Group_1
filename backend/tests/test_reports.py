"""Reports & Export API tests (Part 2).

Runs against the live database via FastAPI TestClient, following the
repository's previous test architecture. Every generated report and
notification is cleaned up in tearDown.
"""

import io
import os
import unittest

from fastapi.testclient import TestClient

from app.core.security import create_access_token
from app.db.database import SessionLocal
from app.main import app
from app.models.audit_log import AuditLog
from app.models.notification import Notification
from app.models.report import Report
from app.models.user import User


def _token(user: User) -> str:
    return create_access_token(user.user_id, user.role, user.token_version)


class TestReportsApi(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app, raise_server_exceptions=False)
        cls.db = SessionLocal()
        cls.users = {
            role: cls.db.query(User).filter(User.role == role).first()
            for role in (
                "ADMIN",
                "GOVERNMENT_OFFICIAL",
                "CITIZEN",
                "RESEARCHER",
                "ORGANIZATION",
                "GUEST",
            )
        }
        cls.govt_b = (
            cls.db.query(User)
            .filter(
                User.role == "GOVERNMENT_OFFICIAL",
                User.user_id != cls.users["GOVERNMENT_OFFICIAL"].user_id,
            )
            .first()
        )
        cls.created_ids: list[int] = []

    @classmethod
    def tearDownClass(cls):
        try:
            if cls.created_ids:
                cls.db.query(Notification).filter(
                    Notification.entity_type == "REPORT",
                    Notification.entity_id.in_(cls.created_ids),
                ).delete(synchronize_session=False)
                for report in (
                    cls.db.query(Report)
                    .filter(Report.report_id.in_(cls.created_ids))
                    .all()
                ):
                    if report.file_path:
                        path = os.path.join("storage/reports", report.file_path)
                        if os.path.exists(path):
                            os.unlink(path)
                cls.db.query(Report).filter(
                    Report.report_id.in_(cls.created_ids)
                ).delete(synchronize_session=False)
                cls.db.commit()
        finally:
            cls.db.close()

    # -- helpers ---------------------------------------------------

    def _auth(self, role: str) -> dict:
        return {"Authorization": f"Bearer {_token(self.users[role])}"}

    def _generate(
        self, role: str, report_type: str, report_format: str = "PDF",
        parameters: dict | None = None, title: str | None = None,
        detail: str | None = None,
    ):
        body: dict = {"report_type": report_type, "report_format": report_format}
        if parameters is not None:
            body["parameters"] = parameters
        if title is not None:
            body["title"] = title
        if detail is not None:
            body["detail"] = detail
        response = self.client.post(
            "/reports/generate", json=body, headers=self._auth(role)
        )
        if response.status_code == 200:
            self.created_ids.append(response.json()["report"]["report_id"])
        return response

    # -- auth ------------------------------------------------------

    def test_no_token_is_401(self):
        self.assertEqual(self.client.get("/reports/types").status_code, 401)

    def test_invalid_token_is_401(self):
        response = self.client.get(
            "/reports/types", headers={"Authorization": "Bearer invalid"}
        )
        self.assertEqual(response.status_code, 401)

    # -- rbac ------------------------------------------------------
    # Reports are restricted to ADMIN and GOVERNMENT_OFFICIAL. Every
    # other role is denied at the route level (403).

    def test_guest_denied_everywhere(self):
        headers = self._auth("GUEST")
        self.assertEqual(
            self.client.get("/reports/types", headers=headers).status_code,
            403,
        )
        self.assertEqual(
            self.client.post(
                "/reports/generate",
                json={"report_type": "POLICY_REPORT", "report_format": "PDF"},
                headers=headers,
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.get("/reports/history", headers=headers).status_code,
            403,
        )

    def test_role_type_matrix(self):
        expected = {
            "ADMIN": 9,
            "GOVERNMENT_OFFICIAL": 7,
            "CITIZEN": 2,
            "RESEARCHER": 6,
            "ORGANIZATION": 6,
        }
        for role, count in expected.items():
            with self.subTest(role=role):
                response = self.client.get(
                    "/reports/types", headers=self._auth(role)
                )
                self.assertEqual(response.status_code, 200)
                self.assertEqual(len(response.json()["report_types"]), count)

    def test_scoped_catalog_contents(self):
        cases = {
            "ADMIN": {
                "USER_REPORT", "POLICY_REPORT", "SCHEME_REPORT",
                "USER_ACTIVITY_REPORT", "DEPARTMENT_REPORT", "MINISTRY_REPORT",
                "STATE_REPORT", "ANALYTICS_REPORT", "AUDIT_REPORT",
            },
            "GOVERNMENT_OFFICIAL": {
                "POLICY_REPORT", "SCHEME_REPORT", "USER_ACTIVITY_REPORT",
                "DEPARTMENT_REPORT", "MINISTRY_REPORT", "STATE_REPORT",
                "ANALYTICS_REPORT",
            },
            "CITIZEN": {"POLICY_REPORT", "SCHEME_REPORT"},
            "RESEARCHER": {
                "POLICY_REPORT", "SCHEME_REPORT", "DEPARTMENT_REPORT",
                "MINISTRY_REPORT", "STATE_REPORT", "ANALYTICS_REPORT",
            },
            "ORGANIZATION": {
                "POLICY_REPORT", "SCHEME_REPORT", "DEPARTMENT_REPORT",
                "MINISTRY_REPORT", "STATE_REPORT", "ANALYTICS_REPORT",
            },
        }
        for role, expected_types in cases.items():
            with self.subTest(role=role):
                body = self.client.get(
                    "/reports/types", headers=self._auth(role)
                ).json()
                self.assertEqual(set(body["report_types"]), expected_types)
                for report_type in expected_types:
                    # every allowed type has a details entry (possibly
                    # empty for single-variant categories)
                    self.assertIn(report_type, body["details"])
                self.assertIn("overview", body)
                if role != "ADMIN":
                    self.assertNotIn("USER_REPORT", body["report_types"])
                    self.assertNotIn("AUDIT_REPORT", body["report_types"])

    def test_admin_has_all_categories(self):
        response = self.client.get(
            "/reports/types", headers=self._auth("ADMIN")
        )
        body = response.json()
        for report_type in (
            "USER_REPORT", "MINISTRY_REPORT", "STATE_REPORT", "AUDIT_REPORT",
        ):
            with self.subTest(type=report_type):
                self.assertIn(report_type, body["report_types"])
                self.assertTrue(body["details"].get(report_type))

    def test_government_has_no_user_or_audit_reports(self):
        response = self.client.get(
            "/reports/types", headers=self._auth("GOVERNMENT_OFFICIAL")
        )
        body = response.json()
        self.assertNotIn("USER_REPORT", body["report_types"])
        self.assertNotIn("AUDIT_REPORT", body["report_types"])
        for report_type in ("POLICY_REPORT", "MINISTRY_REPORT", "STATE_REPORT"):
            with self.subTest(type=report_type):
                self.assertIn(report_type, body["report_types"])

    def test_excluded_roles_have_no_extra_types(self):
        from app.services import report_permissions as permissions

        self.assertEqual(permissions.get_allowed_report_types("GUEST"), ())
        self.assertEqual(
            set(permissions.get_allowed_report_types("CITIZEN")),
            {"POLICY_REPORT", "SCHEME_REPORT"},
        )

    def test_public_roles_denied_privileged_types(self):
        cases = (
            ("CITIZEN", "USER_REPORT"),
            ("CITIZEN", "USER_ACTIVITY_REPORT"),
            ("CITIZEN", "DEPARTMENT_REPORT"),
            ("CITIZEN", "AUDIT_REPORT"),
            ("CITIZEN", "ANALYTICS_REPORT"),
            ("RESEARCHER", "USER_REPORT"),
            ("RESEARCHER", "USER_ACTIVITY_REPORT"),
            ("RESEARCHER", "AUDIT_REPORT"),
            ("ORGANIZATION", "USER_REPORT"),
            ("ORGANIZATION", "USER_ACTIVITY_REPORT"),
            ("ORGANIZATION", "AUDIT_REPORT"),
        )
        for role, report_type in cases:
            with self.subTest(role=role, type=report_type):
                response = self._generate(role, report_type)
                self.assertEqual(response.status_code, 403)

    def test_citizen_policy_scheme_reports(self):
        for report_type in ("POLICY_REPORT", "SCHEME_REPORT"):
            with self.subTest(type=report_type):
                response = self._generate("CITIZEN", report_type)
                self.assertEqual(response.status_code, 200)
                body = response.json()
                self.assertEqual(body["report"]["status"], "COMPLETED")

    def test_citizen_policy_rows_approved_only(self):
        from app.services import report_datasets as datasets

        dataset = datasets.build_policy_dataset(
            self.db, self.users["CITIZEN"], {}
        )
        statuses = {
            row[7] for section in dataset["sections"]
            for row in section["rows"] if section["heading"] == "Policies"
        }
        self.assertTrue(statuses)
        self.assertEqual(statuses, {"APPROVED"})

    def test_researcher_aggregate_reports(self):
        for report_type, detail in (
            ("POLICY_REPORT", "overview"),
            ("SCHEME_REPORT", "overview"),
            ("MINISTRY_REPORT", "overview"),
            ("STATE_REPORT", "overview"),
            ("DEPARTMENT_REPORT", "overview"),
            ("ANALYTICS_REPORT", "overview"),
        ):
            with self.subTest(type=report_type):
                response = self._generate(
                    "RESEARCHER", report_type, detail=detail
                )
                self.assertEqual(response.status_code, 200)

    def test_organization_aggregate_reports(self):
        for report_type in ("POLICY_REPORT", "STATE_REPORT", "ANALYTICS_REPORT"):
            with self.subTest(type=report_type):
                response = self._generate("ORGANIZATION", report_type)
                self.assertEqual(response.status_code, 200)

    def test_researcher_ministry_approved_only(self):
        from app.services import report_datasets as datasets

        dataset = datasets.build_ministry_dataset(
            self.db, self.users["RESEARCHER"], {}
        )
        for section in dataset["sections"]:
            if section["heading"] == "Policy status by ministry":
                for row in section["rows"]:
                    # row: [ministry, APPROVED, PENDING, DRAFT, ...]
                    self.assertEqual(sum(row[2:]), 0)

    def test_public_role_user_id_spoofing_ignored(self):
        # CITIZEN cannot use user_id to reach other users' activity:
        # the type itself is denied.
        response = self._generate(
            "CITIZEN", "USER_ACTIVITY_REPORT",
            parameters={"user_id": self.users["ADMIN"].user_id},
        )
        self.assertEqual(response.status_code, 403)
        # RESEARCHER cannot smuggle user_id into an allowed type.
        response = self._generate(
            "RESEARCHER", "POLICY_REPORT",
            parameters={"user_id": self.users["ADMIN"].user_id},
        )
        self.assertEqual(response.status_code, 200)
        self.assertNotIn(
            "user_id", response.json()["report"]["parameters"]
        )

    def test_cross_role_report_access_denied(self):
        generated = self._generate("GOVERNMENT_OFFICIAL", "POLICY_REPORT")
        self.assertEqual(generated.status_code, 200)
        report_id = generated.json()["report"]["report_id"]
        for role in ("CITIZEN", "RESEARCHER", "ORGANIZATION"):
            with self.subTest(role=role):
                detail = self.client.get(
                    f"/reports/{report_id}", headers=self._auth(role)
                )
                self.assertEqual(detail.status_code, 404)
                download = self.client.get(
                    f"/reports/{report_id}/download", headers=self._auth(role)
                )
                self.assertEqual(download.status_code, 404)

    def test_public_role_own_history_and_download(self):
        generated = self._generate("CITIZEN", "SCHEME_REPORT")
        self.assertEqual(generated.status_code, 200)
        report_id = generated.json()["report"]["report_id"]
        history = self.client.get(
            "/reports/history", headers=self._auth("CITIZEN")
        )
        self.assertEqual(history.status_code, 200)
        self.assertTrue(
            all(
                row["generated_by"] == self.users["CITIZEN"].user_id
                for row in history.json()
            )
        )
        download = self.client.get(
            f"/reports/{report_id}/download", headers=self._auth("CITIZEN")
        )
        self.assertEqual(download.status_code, 200)
        self.assertTrue(download.content.startswith(b"%PDF-"))

    def test_public_role_options_scoped(self):
        response = self.client.get(
            "/reports/options?field=ministry&report_type=POLICY_REPORT",
            headers=self._auth("CITIZEN"),
        )
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.json()["values"], list)
        # options for a denied type stay forbidden
        response = self.client.get(
            "/reports/options?field=role&report_type=USER_REPORT",
            headers=self._auth("CITIZEN"),
        )
        self.assertEqual(response.status_code, 403)

    # -- formats ---------------------------------------------------

    def test_pdf_and_excel_generate(self):
        for report_format, signature in (("PDF", b"%PDF-"), ("EXCEL", b"PK\x03\x04")):
            with self.subTest(format=report_format):
                generated = self._generate(
                    "ADMIN", "POLICY_REPORT", report_format
                )
                self.assertEqual(generated.status_code, 200)
                report = generated.json()["report"]
                self.assertEqual(report["status"], "COMPLETED")
                self.assertIsNotNone(report["file_size"])
                download = self.client.get(
                    f"/reports/{report['report_id']}/download",
                    headers=self._auth("ADMIN"),
                )
                self.assertEqual(download.status_code, 200)
                self.assertTrue(download.content.startswith(signature))

    def test_invalid_format_rejected(self):
        response = self.client.post(
            "/reports/generate",
            json={"report_type": "POLICY_REPORT", "report_format": "CSV"},
            headers=self._auth("ADMIN"),
        )
        self.assertIn(response.status_code, (400, 422))

    def test_invalid_type_rejected(self):
        response = self.client.post(
            "/reports/generate",
            json={"report_type": "NOPE", "report_format": "PDF"},
            headers=self._auth("ADMIN"),
        )
        self.assertIn(response.status_code, (400, 422))

    # -- filters ---------------------------------------------------

    def test_date_inversion_rejected(self):
        response = self._generate(
            "ADMIN",
            "POLICY_REPORT",
            parameters={"date_from": "2026-02-01", "date_to": "2026-01-01"},
        )
        self.assertEqual(response.status_code, 400)

    def test_policy_district_rejected(self):
        response = self._generate(
            "ADMIN", "POLICY_REPORT", parameters={"district": "X"}
        )
        self.assertEqual(response.status_code, 400)

    def test_scheme_sector_and_district_rejected(self):
        for parameters in ({"sector": "X"}, {"district": "X"}):
            with self.subTest(parameters=parameters):
                response = self._generate(
                    "ADMIN", "SCHEME_REPORT", parameters=parameters
                )
                self.assertEqual(response.status_code, 400)

    def test_unknown_filter_keys_dropped(self):
        response = self._generate(
            "ADMIN", "POLICY_REPORT", parameters={"hacker": "1"}
        )
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("hacker", response.json()["report"]["parameters"])

    # -- details ---------------------------------------------------

    def test_detail_variants_generate(self):
        cases = (
            ("POLICY_REPORT", "ministry-wise"),
            ("POLICY_REPORT", "status"),
            ("SCHEME_REPORT", "expiring"),
            ("USER_REPORT", "role-wise"),
            ("MINISTRY_REPORT", "policy-vs-scheme"),
            ("STATE_REPORT", "policy"),
            ("AUDIT_REPORT", "action-wise"),
        )
        for report_type, detail in cases:
            with self.subTest(type=report_type, detail=detail):
                response = self._generate(
                    "ADMIN", report_type, detail=detail
                )
                self.assertEqual(response.status_code, 200)
                body = response.json()
                self.assertEqual(body["report"]["status"], "COMPLETED")
                self.assertEqual(
                    body["report"]["parameters"].get("detail"), detail
                )

    def test_invalid_detail_rejected(self):
        response = self._generate(
            "ADMIN", "POLICY_REPORT", detail="bogus-detail"
        )
        self.assertEqual(response.status_code, 400)
        # Explicit default detail values are accepted everywhere.
        response = self._generate(
            "ADMIN", "ANALYTICS_REPORT", detail="overview"
        )
        self.assertEqual(response.status_code, 200)

    def test_government_detail_variants(self):
        for report_type, detail in (
            ("MINISTRY_REPORT", "overview"),
            ("STATE_REPORT", "scheme"),
            ("POLICY_REPORT", "state-wise"),
        ):
            with self.subTest(type=report_type, detail=detail):
                response = self._generate(
                    "GOVERNMENT_OFFICIAL", report_type, detail=detail
                )
                self.assertEqual(response.status_code, 200)

    def test_government_denied_user_and_audit_reports(self):
        for report_type in ("USER_REPORT", "AUDIT_REPORT"):
            with self.subTest(type=report_type):
                response = self._generate("GOVERNMENT_OFFICIAL", report_type)
                self.assertEqual(response.status_code, 403)

    # -- new builders ------------------------------------------------

    def test_user_report_builder(self):
        response = self._generate("ADMIN", "USER_REPORT", detail="overview")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["report"]["status"], "COMPLETED")
        summary = body["data"]["summary"]
        self.assertIn("Total users", summary)
        self.assertGreaterEqual(summary["Total users"], 1)

    def test_user_report_filters(self):
        response = self._generate(
            "ADMIN", "USER_REPORT",
            parameters={"role": "CITIZEN", "status": "active"},
        )
        self.assertEqual(response.status_code, 200)

    def test_ministry_state_audit_reports(self):
        for report_type in ("MINISTRY_REPORT", "STATE_REPORT", "AUDIT_REPORT"):
            with self.subTest(type=report_type):
                for report_format in ("PDF", "EXCEL"):
                    with self.subTest(format=report_format):
                        response = self._generate(
                            "ADMIN", report_type, report_format
                        )
                        self.assertEqual(response.status_code, 200)
                        self.assertEqual(
                            response.json()["report"]["status"], "COMPLETED"
                        )

    def test_activity_action_entity_filters(self):
        response = self._generate(
            "ADMIN", "USER_ACTIVITY_REPORT",
            parameters={"action": "GENERATE_REPORT"},
        )
        self.assertEqual(response.status_code, 200)
        response = self._generate(
            "ADMIN", "AUDIT_REPORT",
            parameters={"entity_type": "REPORT"},
        )
        self.assertEqual(response.status_code, 200)

    def test_user_report_district_allowed(self):
        response = self._generate(
            "ADMIN", "USER_REPORT", parameters={"district": "Delhi"}
        )
        # district is a real user-table dimension: accepted (maybe empty).
        self.assertEqual(response.status_code, 200)

    # -- options -----------------------------------------------------

    def test_options_endpoint(self):
        cases = (
            ("ministry", "POLICY_REPORT"),
            ("role", "USER_REPORT"),
            ("action", "AUDIT_REPORT"),
            ("state", "STATE_REPORT"),
        )
        for field, report_type in cases:
            with self.subTest(field=field, type=report_type):
                response = self.client.get(
                    f"/reports/options?field={field}&report_type={report_type}",
                    headers=self._auth("ADMIN"),
                )
                self.assertEqual(response.status_code, 200)
                self.assertIsInstance(response.json()["values"], list)

    def test_options_rejected(self):
        # district is not a policy dimension
        response = self.client.get(
            "/reports/options?field=district&report_type=POLICY_REPORT",
            headers=self._auth("ADMIN"),
        )
        self.assertEqual(response.status_code, 400)
        # unknown field
        response = self.client.get(
            "/reports/options?field=hacker&report_type=POLICY_REPORT",
            headers=self._auth("ADMIN"),
        )
        self.assertEqual(response.status_code, 400)
        # excluded role
        response = self.client.get(
            "/reports/options?field=ministry&report_type=POLICY_REPORT",
            headers=self._auth("GUEST"),
        )
        self.assertEqual(response.status_code, 403)

    # -- ownership -------------------------------------------------

    def test_owner_non_owner_admin(self):
        if self.govt_b is None:
            self.skipTest("Second government user not available")
        generated = self._generate("GOVERNMENT_OFFICIAL", "POLICY_REPORT")
        self.assertEqual(generated.status_code, 200)
        report_id = generated.json()["report"]["report_id"]

        owner = self.client.get(
            f"/reports/{report_id}", headers=self._auth("GOVERNMENT_OFFICIAL")
        )
        self.assertEqual(owner.status_code, 200)

        stranger_headers = {
            "Authorization": f"Bearer {_token(self.govt_b)}"
        }
        stranger = self.client.get(
            f"/reports/{report_id}", headers=stranger_headers
        )
        self.assertEqual(stranger.status_code, 404)

        stranger_dl = self.client.get(
            f"/reports/{report_id}/download", headers=stranger_headers
        )
        self.assertEqual(stranger_dl.status_code, 404)

        admin = self.client.get(
            f"/reports/{report_id}", headers=self._auth("ADMIN")
        )
        self.assertEqual(admin.status_code, 200)

    def test_history_scoping(self):
        admin_history = self.client.get(
            "/reports/history", headers=self._auth("ADMIN")
        )
        govt_history = self.client.get(
            "/reports/history", headers=self._auth("GOVERNMENT_OFFICIAL")
        )
        self.assertEqual(admin_history.status_code, 200)
        self.assertEqual(govt_history.status_code, 200)
        for row in govt_history.json():
            self.assertEqual(
                row["generated_by"],
                self.users["GOVERNMENT_OFFICIAL"].user_id,
            )

    def test_missing_report_is_404(self):
        response = self.client.get(
            "/reports/999999999", headers=self._auth("ADMIN")
        )
        self.assertEqual(response.status_code, 404)

    # -- user activity ----------------------------------------------

    def test_govt_activity_self_scoped(self):
        response = self._generate("GOVERNMENT_OFFICIAL", "USER_ACTIVITY_REPORT")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json()["report"]["parameters"].get("user_id"),
            self.users["GOVERNMENT_OFFICIAL"].user_id,
        )

    def test_empty_activity_is_completed(self):
        response = self._generate(
            "GOVERNMENT_OFFICIAL",
            "USER_ACTIVITY_REPORT",
            parameters={"date_from": "2000-01-01", "date_to": "2000-01-02"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["report"]["status"], "COMPLETED")

    # -- empty datasets ---------------------------------------------

    def test_empty_policy_report_completed(self):
        response = self._generate(
            "ADMIN",
            "POLICY_REPORT",
            parameters={"ministry": "Ministry That Does Not Exist XYZ"},
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["report"]["status"], "COMPLETED")
        self.assertTrue(body["data"]["empty"])

    # -- file validity -----------------------------------------------

    def test_pdf_signature(self):
        generated = self._generate("ADMIN", "ANALYTICS_REPORT", "PDF")
        self.assertEqual(generated.status_code, 200)
        download = self.client.get(
            f"/reports/{generated.json()['report']['report_id']}/download",
            headers=self._auth("ADMIN"),
        )
        self.assertTrue(download.content.startswith(b"%PDF-"))
        self.assertIn("application/pdf", download.headers["content-type"])

    def test_excel_sheets(self):
        from openpyxl import load_workbook

        generated = self._generate("ADMIN", "DEPARTMENT_REPORT", "EXCEL")
        self.assertEqual(generated.status_code, 200)
        download = self.client.get(
            f"/reports/{generated.json()['report']['report_id']}/download",
            headers=self._auth("ADMIN"),
        )
        workbook = load_workbook(filename=io.BytesIO(download.content))
        self.assertIn("Summary", workbook.sheetnames)
        self.assertIn("Meta", workbook.sheetnames)
        self.assertIn("Data", workbook.sheetnames)

    # -- traversal ----------------------------------------------------

    def test_path_traversal_rejected(self):
        from app.services import report_export_service as export

        with self.assertRaises(ValueError):
            export.resolve_inside_reports_dir(
                export.get_reports_dir(), "../../etc/passwd"
            )
        with self.assertRaises(ValueError):
            export.resolve_inside_reports_dir(
                export.get_reports_dir(), "/abs/path.pdf"
            )

    # -- audit ---------------------------------------------------------

    def test_audit_logged(self):
        generated = self._generate("GOVERNMENT_OFFICIAL", "SCHEME_REPORT")
        self.assertEqual(generated.status_code, 200)
        report_id = generated.json()["report"]["report_id"]
        self.client.get(
            f"/reports/{report_id}/download",
            headers=self._auth("GOVERNMENT_OFFICIAL"),
        )
        actions = {
            row.action
            for row in self.db.query(AuditLog)
            .filter(
                AuditLog.entity_type == "REPORT",
                AuditLog.entity_id == report_id,
            )
            .all()
        }
        self.assertIn("GENERATE_REPORT", actions)
        self.assertIn("DOWNLOAD_REPORT", actions)

    # -- legacy ---------------------------------------------------------

    def test_legacy_routes_intact(self):
        headers = self._auth("ADMIN")
        self.assertEqual(
            self.client.get("/reports/role", headers=headers).status_code, 200
        )
        self.assertEqual(
            self.client.get("/reports/legacy/POLICY", headers=headers).status_code,
            200,
        )


if __name__ == "__main__":
    unittest.main()
