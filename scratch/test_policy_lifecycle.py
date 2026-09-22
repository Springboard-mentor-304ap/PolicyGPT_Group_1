import requests
import sys

BASE_URL = "http://localhost:8000"

def log(msg):
    print(f"[TEST] {msg}")

def test_complete_policy_lifecycle():
    log("Starting End-to-End Policy Lifecycle Test...")

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
    log("Testing GET /analytics/policies...")
    res = requests.get(f"{BASE_URL}/analytics/policies", headers=admin_headers)
    assert res.status_code == 200, f"Analytics failed: {res.text}"
    stats = res.json()
    log(f"Analytics returned: Total={stats.get('total')}, Approved={stats.get('approved')}, Pending={stats.get('pending')}")

    # 5. Government Official creates a draft policy
    log("Creating a new policy as Government Official...")
    policy_payload = {
        "title": "National Clean Energy Initiative 2026",
        "description": "Comprehensive renewable energy deployment framework for distributed solar and wind.",
        "category": "Environment",
        "ministry": "Ministry of New & Renewable Energy",
        "department": "Department of Renewable Energy",
        "state": "All India",
        "sector": "Environment",
        "publication_date": "2026-03-15",
        "effective_date": "2026-04-01",
        "source_url": "https://mnre.gov.in/policies/clean-energy-2026",
        "document_url": "https://mnre.gov.in/docs/clean-energy-2026.pdf",
        "benefits": ["Subsidized rooftop solar installation", "Net-metering support", "Low-interest green financing"]
    }
    res = requests.post(f"{BASE_URL}/policies", json=policy_payload, headers=gov_headers)
    assert res.status_code in (200, 201), f"Policy creation failed: {res.text}"
    policy = res.json()
    policy_id = policy["policy_id"]
    log(f"Policy created: ID={policy_id}, Status={policy['status']}")
    assert policy["status"] == "DRAFT", f"Expected status DRAFT, got {policy['status']}"

    # 6. Verify Citizen CANNOT see the draft policy
    log("Verifying Citizen cannot view DRAFT policy...")
    res = requests.get(f"{BASE_URL}/policies/{policy_id}", headers=citizen_headers)
    assert res.status_code in (403, 404), f"Expected 403 or 404 for citizen viewing draft, got {res.status_code}"
    log("Citizen access to DRAFT policy properly blocked.")

    # 7. Gov Official submits policy for approval
    log(f"Gov Official submitting policy {policy_id} for approval...")
    res = requests.post(f"{BASE_URL}/policies/{policy_id}/submit", headers=gov_headers)
    assert res.status_code == 200, f"Submit failed: {res.text}"
    policy = res.json()
    log(f"Policy status after submit: {policy['status']}")
    assert policy["status"] == "PENDING_APPROVAL", f"Expected PENDING_APPROVAL, got {policy['status']}"

    # 8. Verify Gov Official CANNOT approve the policy
    log("Verifying Gov Official cannot approve policy...")
    res = requests.post(f"{BASE_URL}/policies/{policy_id}/approve", headers=gov_headers)
    assert res.status_code == 403, f"Expected 403 when Gov Official tries to approve, got {res.status_code}"
    log("Gov Official approve attempt properly rejected with 403 Forbidden.")

    # 9. Admin rejects policy with reason
    log(f"Admin rejecting policy {policy_id} with reason...")
    rejection_reason = "Please specify detailed eligibility criteria and minimum solar capacity guidelines."
    res = requests.post(f"{BASE_URL}/policies/{policy_id}/reject", json={"reason": rejection_reason}, headers=admin_headers)
    assert res.status_code == 200, f"Reject failed: {res.text}"
    policy = res.json()
    log(f"Policy status after reject: {policy['status']}, Reason: {policy.get('rejection_reason')}")
    assert policy["status"] == "REJECTED"
    assert policy.get("rejection_reason") == rejection_reason

    # 10. Gov Official re-submits policy
    log(f"Gov Official re-submitting rejected policy {policy_id}...")
    res = requests.post(f"{BASE_URL}/policies/{policy_id}/submit", headers=gov_headers)
    assert res.status_code == 200, f"Re-submit failed: {res.text}"
    assert res.json()["status"] == "PENDING_APPROVAL"
    log("Policy re-submitted to PENDING_APPROVAL.")

    # 11. Admin approves policy
    log(f"Admin approving policy {policy_id}...")
    res = requests.post(f"{BASE_URL}/policies/{policy_id}/approve", headers=admin_headers)
    assert res.status_code == 200, f"Approve failed: {res.text}"
    policy = res.json()
    log(f"Policy status after approval: {policy['status']}, Approved By: {policy.get('approved_by')}")
    assert policy["status"] == "APPROVED"

    # 12. Citizen can now see the approved policy
    log(f"Verifying Citizen can now view approved policy {policy_id}...")
    res = requests.get(f"{BASE_URL}/policies/{policy_id}", headers=citizen_headers)
    assert res.status_code == 200, f"Citizen view failed: {res.text}"
    assert res.json()["status"] == "APPROVED"
    log("Citizen can successfully view the approved policy.")

    # 13. Gov Official requests archive
    log(f"Gov Official requesting archive for policy {policy_id}...")
    archive_reason = "Superseded by National Energy Mission update 2026."
    res = requests.post(f"{BASE_URL}/policies/{policy_id}/request-archive", json={"reason": archive_reason}, headers=gov_headers)
    assert res.status_code == 200, f"Request archive failed: {res.text}"
    policy = res.json()
    log(f"Policy status after archive request: {policy['status']}")
    assert policy["status"] == "ARCHIVE_REQUESTED"

    # 14. Admin approves archive
    log(f"Admin approving archive for policy {policy_id}...")
    res = requests.post(f"{BASE_URL}/policies/{policy_id}/approve-archive", headers=admin_headers)
    assert res.status_code == 200, f"Approve archive failed: {res.text}"
    policy = res.json()
    log(f"Policy status after archive approval: {policy['status']}")
    assert policy["status"] == "ARCHIVED"

    # 15. Admin restores policy
    log(f"Admin restoring archived policy {policy_id}...")
    res = requests.post(f"{BASE_URL}/policies/{policy_id}/restore", headers=admin_headers)
    assert res.status_code == 200, f"Restore failed: {res.text}"
    policy = res.json()
    log(f"Policy status after restore: {policy['status']}")
    # Restore reverts policy to APPROVED in backend
    assert policy["status"] in ("APPROVED", "DRAFT")

    # 16. Gov Official requests deletion
    log(f"Gov Official requesting deletion for policy {policy_id}...")
    delete_reason = "Obsolete test policy created during system verification."
    res = requests.post(f"{BASE_URL}/policies/{policy_id}/request-delete", json={"reason": delete_reason}, headers=gov_headers)
    assert res.status_code == 200, f"Request delete failed: {res.text}"
    policy = res.json()
    log(f"Policy status after delete request: {policy['status']}")
    assert policy["status"] == "DELETE_REQUESTED"

    # 17. Admin approves deletion (permanent delete)
    log(f"Admin approving deletion for policy {policy_id}...")
    res = requests.post(f"{BASE_URL}/policies/{policy_id}/approve-delete", headers=admin_headers)
    assert res.status_code in (200, 204), f"Approve delete failed: {res.text}"
    log("Policy permanently deleted.")

    # 18. Verify policy is gone
    res = requests.get(f"{BASE_URL}/policies/{policy_id}", headers=admin_headers)
    assert res.status_code == 404, f"Expected 404 for deleted policy, got {res.status_code}"
    log("Verified policy 404 after deletion.")

    # 19. Admin Direct Add + Submit + Auto-Approve Flow
    log("Testing Admin Create -> Submit -> Auto-Approve Flow...")
    res = requests.post(f"{BASE_URL}/policies", json={
        "title": "Admin Instant Solar Grid Framework",
        "description": "Direct policy publication by Admin.",
        "category": "Technology",
        "ministry": "Ministry of Electronics & IT",
        "department": "Department of Electronics & IT",
        "state": "All India",
        "sector": "Information Technology"
    }, headers=admin_headers)
    assert res.status_code in (200, 201), f"Admin policy create failed: {res.text}"
    admin_pol = res.json()
    admin_pol_id = admin_pol["policy_id"]
    log(f"Admin created policy ID={admin_pol_id}, Status={admin_pol['status']}")

    # Submit
    res = requests.post(f"{BASE_URL}/policies/{admin_pol_id}/submit", headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["status"] == "PENDING_APPROVAL"
    # Auto-Approve
    res = requests.post(f"{BASE_URL}/policies/{admin_pol_id}/approve", headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["status"] == "APPROVED"
    log(f"Admin policy {admin_pol_id} successfully submitted and auto-approved!")

    # Cleanup test policy
    requests.delete(f"{BASE_URL}/policies/{admin_pol_id}", headers=admin_headers)
    log("Cleanup completed.")

    log("ALL 19 POLICY LIFECYCLE TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    test_complete_policy_lifecycle()
