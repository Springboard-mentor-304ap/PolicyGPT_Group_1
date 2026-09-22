import requests
import sys

BASE_URL = "http://localhost:8000"

def log(msg):
    print(f"[TEST] {msg}")

def test_complete_scheme_lifecycle():
    log("Starting End-to-End Scheme Lifecycle Test...")

    # 1. Login as Admin
    log("Logging in as Admin (admin@gmail.com)...")
    res = requests.post(f"{BASE_URL}/auth/login", json={"identifier": "admin@gmail.com", "password": "Admin@123"})
    assert res.status_code == 200, f"Admin login failed: {res.text}"
    admin_token = res.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    log("Admin login successful.")

    # 2. Login as Gov Official
    log("Logging in as Government Official (govt@gmail.com)...")
    res = requests.post(f"{BASE_URL}/auth/login", json={"identifier": "govt@gmail.com", "password": "Gov@1234"})
    assert res.status_code == 200, f"Gov login failed: {res.text}"
    gov_token = res.json()["access_token"]
    gov_headers = {"Authorization": f"Bearer {gov_token}"}
    log("Gov Official login successful.")

    # 3. Login as Citizen
    log("Logging in as Citizen (citizen@gmail.com)...")
    res = requests.post(f"{BASE_URL}/auth/login", json={"identifier": "citizen@gmail.com", "password": "Test@123"})
    assert res.status_code == 200, f"Citizen login failed: {res.text}"
    citizen_token = res.json()["access_token"]
    citizen_headers = {"Authorization": f"Bearer {citizen_token}"}
    log("Citizen login successful.")

    # 4. Check Analytics before creating
    log("Testing GET /analytics/schemes...")
    res = requests.get(f"{BASE_URL}/analytics/schemes", headers=admin_headers)
    assert res.status_code == 200, f"Analytics failed: {res.text}"
    stats = res.json()
    log(f"Analytics returned: Total={stats.get('total')}, Approved={stats.get('approved')}, Pending={stats.get('pending')}")

    # 5. Government Official creates a draft scheme
    log("Creating a new scheme as Government Official...")
    scheme_payload = {
        "name": "National Clean Energy Scheme 2026",
        "description": "Comprehensive renewable energy deployment framework for distributed solar and wind.",
        "category": "Energy",
        "ministry": "Ministry of New & Renewable Energy",
        "department": "Department of Renewable Energy",
        "state": "All India",
        "source_url": "https://mnre.gov.in/schemes/clean-energy-2026",
        "application_url": "https://mnre.gov.in/schemes/clean-energy-2026/apply",
        "application_process": "1. Register online\n2. Submit documentation\n3. Verification and grant",
        "documents_required": "Aadhaar, Electricity bill, Bank passbook",
        "benefits": ["Subsidized rooftop solar installation", "Net-metering support", "Low-interest green financing"],
        "eligibility_rules": [{"rule_type": "AGE_CRITERIA", "min_age": 18, "max_age": 70}]
    }
    res = requests.post(f"{BASE_URL}/schemes", json=scheme_payload, headers=gov_headers)
    assert res.status_code in (200, 201), f"Scheme creation failed: {res.text}"
    scheme = res.json()
    scheme_id = scheme["scheme_id"]
    log(f"Scheme created: ID={scheme_id}, Status={scheme['status']}")
    assert scheme["status"] == "DRAFT", f"Expected status DRAFT, got {scheme['status']}"

    # 6. Verify Citizen CANNOT see the draft scheme
    log("Verifying Citizen cannot view DRAFT scheme...")
    res = requests.get(f"{BASE_URL}/schemes/{scheme_id}", headers=citizen_headers)
    assert res.status_code in (403, 404), f"Expected 403 or 404 for citizen viewing draft, got {res.status_code}"
    log("Citizen access to DRAFT scheme properly blocked.")

    # 7. Gov Official submits scheme for approval
    log(f"Gov Official submitting scheme {scheme_id} for approval...")
    res = requests.post(f"{BASE_URL}/schemes/{scheme_id}/submit", headers=gov_headers)
    assert res.status_code == 200, f"Submit failed: {res.text}"
    scheme = res.json()
    log(f"Scheme status after submit: {scheme['status']}")
    assert scheme["status"] == "PENDING_APPROVAL", f"Expected PENDING_APPROVAL, got {scheme['status']}"

    # 8. Verify Gov Official CANNOT approve the scheme
    log("Verifying Gov Official cannot approve scheme...")
    res = requests.post(f"{BASE_URL}/schemes/{scheme_id}/approve", headers=gov_headers)
    assert res.status_code == 403, f"Expected 403 when Gov Official tries to approve, got {res.status_code}"
    log("Gov Official approve attempt properly rejected with 403 Forbidden.")

    # 9. Admin rejects scheme with reason
    log(f"Admin rejecting scheme {scheme_id} with reason...")
    rejection_reason = "Please specify detailed eligibility criteria and minimum solar capacity guidelines."
    res = requests.post(f"{BASE_URL}/schemes/{scheme_id}/reject", json={"reason": rejection_reason}, headers=admin_headers)
    assert res.status_code == 200, f"Reject failed: {res.text}"
    scheme = res.json()
    log(f"Scheme status after reject: {scheme['status']}, Reason: {scheme.get('rejection_reason')}")
    assert scheme["status"] == "REJECTED"
    assert scheme.get("rejection_reason") == rejection_reason

    # 10. Gov Official re-submits scheme
    log(f"Gov Official re-submitting rejected scheme {scheme_id}...")
    res = requests.post(f"{BASE_URL}/schemes/{scheme_id}/submit", headers=gov_headers)
    assert res.status_code == 200, f"Re-submit failed: {res.text}"
    assert res.json()["status"] == "PENDING_APPROVAL"
    log("Scheme re-submitted to PENDING_APPROVAL.")

    # 11. Admin approves scheme
    log(f"Admin approving scheme {scheme_id}...")
    res = requests.post(f"{BASE_URL}/schemes/{scheme_id}/approve", headers=admin_headers)
    assert res.status_code == 200, f"Approve failed: {res.text}"
    scheme = res.json()
    log(f"Scheme status after approval: {scheme['status']}, Approved By: {scheme.get('approved_by')}")
    assert scheme["status"] == "APPROVED"

    # 12. Citizen can now see the approved scheme
    log(f"Verifying Citizen can now view approved scheme {scheme_id}...")
    res = requests.get(f"{BASE_URL}/schemes/{scheme_id}", headers=citizen_headers)
    assert res.status_code == 200, f"Citizen view failed: {res.text}"
    assert res.json()["status"] == "APPROVED"
    log("Citizen can successfully view the approved scheme.")

    # 13. Gov Official requests archive
    log(f"Gov Official requesting archive for scheme {scheme_id}...")
    archive_reason = "Superseded by National Energy Mission update 2026."
    res = requests.post(f"{BASE_URL}/schemes/{scheme_id}/request-archive", json={"reason": archive_reason}, headers=gov_headers)
    assert res.status_code == 200, f"Request archive failed: {res.text}"
    scheme = res.json()
    log(f"Scheme status after archive request: {scheme['status']}")
    assert scheme["status"] == "ARCHIVE_REQUESTED"

    # 14. Admin approves archive
    log(f"Admin approving archive for scheme {scheme_id}...")
    res = requests.post(f"{BASE_URL}/schemes/{scheme_id}/approve-archive", headers=admin_headers)
    assert res.status_code == 200, f"Approve archive failed: {res.text}"
    scheme = res.json()
    log(f"Scheme status after archive approval: {scheme['status']}")
    assert scheme["status"] == "ARCHIVED"

    # 15. Admin restores scheme
    log(f"Admin restoring archived scheme {scheme_id}...")
    res = requests.post(f"{BASE_URL}/schemes/{scheme_id}/restore", headers=admin_headers)
    assert res.status_code == 200, f"Restore failed: {res.text}"
    scheme = res.json()
    log(f"Scheme status after restore: {scheme['status']}")
    assert scheme["status"] in ("APPROVED", "DRAFT")

    # 16. Gov Official requests deletion
    log(f"Gov Official requesting deletion for scheme {scheme_id}...")
    delete_reason = "Obsolete test scheme created during system verification."
    res = requests.post(f"{BASE_URL}/schemes/{scheme_id}/request-delete", json={"reason": delete_reason}, headers=gov_headers)
    assert res.status_code == 200, f"Request delete failed: {res.text}"
    scheme = res.json()
    log(f"Scheme status after delete request: {scheme['status']}")
    assert scheme["status"] == "DELETE_REQUESTED"

    # 17. Admin approves deletion (permanent delete)
    log(f"Admin approving deletion for scheme {scheme_id}...")
    res = requests.post(f"{BASE_URL}/schemes/{scheme_id}/approve-delete", headers=admin_headers)
    assert res.status_code in (200, 204), f"Approve delete failed: {res.text}"
    log("Scheme permanently deleted.")

    # 18. Verify scheme is gone
    res = requests.get(f"{BASE_URL}/schemes/{scheme_id}", headers=admin_headers)
    assert res.status_code == 404, f"Expected 404 for deleted scheme, got {res.status_code}"
    log("Verified scheme 404 after deletion.")

    # 19. Admin Direct Add + Submit + Auto-Approve Flow
    log("Testing Admin Create -> Submit -> Auto-Approve Flow...")
    res = requests.post(f"{BASE_URL}/schemes", json={
        "name": "Admin Instant Solar Grid Scheme",
        "description": "Direct scheme publication by Admin.",
        "category": "Energy",
        "ministry": "Ministry of New & Renewable Energy",
        "department": "Department of Renewable Energy",
        "state": "All India"
    }, headers=admin_headers)
    assert res.status_code in (200, 201), f"Admin scheme create failed: {res.text}"
    admin_sch = res.json()
    admin_sch_id = admin_sch["scheme_id"]
    log(f"Admin created scheme ID={admin_sch_id}, Status={admin_sch['status']}")

    # Submit
    res = requests.post(f"{BASE_URL}/schemes/{admin_sch_id}/submit", headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["status"] == "PENDING_APPROVAL"
    # Auto-Approve
    res = requests.post(f"{BASE_URL}/schemes/{admin_sch_id}/approve", headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["status"] == "APPROVED"
    log(f"Admin scheme {admin_sch_id} successfully submitted and auto-approved!")

    # Cleanup test scheme
    requests.delete(f"{BASE_URL}/schemes/{admin_sch_id}", headers=admin_headers)
    log("Cleanup completed.")

    log("ALL 19 SCHEME LIFECYCLE TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    test_complete_scheme_lifecycle()
