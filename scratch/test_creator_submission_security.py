import requests
import sys

BASE_URL = "http://localhost:8000"

def log(msg):
    print(f"[SECURITY-TEST] {msg}")

def test_creator_submission_security():
    log("==================================================")
    log("STARTING CREATOR-ONLY SUBMISSION SECURITY TEST")
    log("==================================================")

    # 1. Login users
    log("Logging in Admin (admin@gmail.com)...")
    res = requests.post(f"{BASE_URL}/auth/login", json={"identifier": "admin@gmail.com", "password": "Admin@123"})
    assert res.status_code == 200, f"Admin login failed: {res.text}"
    admin_token = res.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    log("Logging in Government Official 1 (govt@gmail.com)...")
    res = requests.post(f"{BASE_URL}/auth/login", json={"identifier": "govt@gmail.com", "password": "Gov@1234"})
    assert res.status_code == 200, f"Gov 1 login failed: {res.text}"
    gov1_token = res.json()["access_token"]
    gov1_user = res.json()["user"]
    gov1_id = gov1_user["user_id"]
    gov1_headers = {"Authorization": f"Bearer {gov1_token}"}
    log(f"Gov Official 1 logged in: ID={gov1_id}")

    log("Logging in Government Official 2 (gov2_unique@gov.com)...")
    res = requests.post(f"{BASE_URL}/auth/login", json={"identifier": "gov2_unique@gov.com", "password": "Password@123"})
    if res.status_code != 200:
        log("Registering Government Official 2...")
        requests.post(f"{BASE_URL}/auth/register", json={
            "full_name": "Test Gov Officer 2",
            "email": "gov2_unique@gov.com",
            "password": "Password@123",
            "confirm_password": "Password@123",
            "role": "GOVERNMENT_OFFICIAL",
            "organization": "Ministry of Agriculture",
            "occupation": "Policy Analyst"
        })
        res = requests.post(f"{BASE_URL}/auth/login", json={"identifier": "gov2_unique@gov.com", "password": "Password@123"})
    assert res.status_code == 200, f"Gov 2 login failed: {res.text}"
    gov2_token = res.json()["access_token"]
    gov2_user = res.json()["user"]
    gov2_id = gov2_user["user_id"]
    gov2_headers = {"Authorization": f"Bearer {gov2_token}"}
    log(f"Gov Official 2 logged in: ID={gov2_id}")

    assert gov1_id != gov2_id, f"Gov1 and Gov2 must have different IDs! Got {gov1_id} and {gov2_id}"

    # ============================================================
    # PART 1: POLICY CREATOR-ONLY SUBMISSION SECURITY
    # ============================================================
    log("\n--- TESTING POLICY SUBMISSION AUTHORIZATION ---")

    # Step 1.1: Gov 1 creates Policy A (trying to override created_by to 999)
    policy_payload = {
        "title": "Security Test Agro-Tech Framework 2026",
        "description": "Smart agriculture and automated irrigation support policy.",
        "category": "Agriculture",
        "ministry": "Ministry of Agriculture",
        "department": "Department of Agricultural Research",
        "state": "All India",
        "sector": "Agriculture",
        "benefits": ["Smart soil sensors", "Subsidized drip irrigation"],
        "created_by": 999  # Frontend attempt to spoof created_by
    }
    res = requests.post(f"{BASE_URL}/policies", json=policy_payload, headers=gov1_headers)
    assert res.status_code in (200, 201), f"Policy creation failed: {res.text}"
    policy_a = res.json()
    policy_a_id = policy_a["policy_id"]
    log(f"Policy A created by Gov 1: ID={policy_a_id}, Status={policy_a['status']}, created_by={policy_a.get('created_by')}")
    assert policy_a["status"] == "DRAFT"
    # Ensure backend ignored spoofed created_by and used authenticated user
    assert policy_a.get("created_by") == gov1_id, f"Backend failed to set created_by to authenticated user! Got {policy_a.get('created_by')}"

    # Step 1.2: Gov 2 (Non-Creator) calls POST /policies/{id}/submit directly
    log(f"Gov 2 (ID={gov2_id}) attempting to submit Gov 1's Policy A (ID={policy_a_id})...")
    res = requests.post(f"{BASE_URL}/policies/{policy_a_id}/submit", headers=gov2_headers)
    log(f"Gov 2 submit response status: {res.status_code}, response: {res.text}")
    assert res.status_code == 403, f"Expected 403 Forbidden for non-creator policy submission, got {res.status_code}"
    error_detail = res.json().get("detail", "")
    assert "Only the user who created it can submit it for approval" in error_detail, f"Unexpected error detail: {error_detail}"
    log("Gov 2 non-creator submit properly rejected with 403 Forbidden.")

    # Step 1.3: Verify Policy A status is UNCHANGED (still DRAFT)
    res = requests.get(f"{BASE_URL}/policies/{policy_a_id}", headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["status"] == "DRAFT", f"Policy status was altered! Expected DRAFT, got {res.json()['status']}"
    log("Verified Policy A status remained DRAFT after rejected attempt.")

    # Step 1.4: Gov 1 (Creator) submits Policy A
    log(f"Gov 1 (Creator ID={gov1_id}) submitting Policy A...")
    res = requests.post(f"{BASE_URL}/policies/{policy_a_id}/submit", headers=gov1_headers)
    assert res.status_code == 200, f"Creator policy submit failed: {res.text}"
    assert res.json()["status"] == "PENDING_APPROVAL", f"Expected PENDING_APPROVAL, got {res.json()['status']}"
    log("Gov 1 creator submit succeeded: Status=PENDING_APPROVAL.")

    # Step 1.5: Gov 2 attempts submit again on PENDING_APPROVAL policy -> still 403
    res = requests.post(f"{BASE_URL}/policies/{policy_a_id}/submit", headers=gov2_headers)
    assert res.status_code == 403, f"Expected 403 for non-creator even when pending, got {res.status_code}"
    log("Gov 2 attempt on PENDING_APPROVAL policy properly rejected with 403.")

    # Step 1.6: Admin rejects Policy A with reason
    log("Admin rejecting Policy A to test REJECTED re-submit authorization...")
    res = requests.post(f"{BASE_URL}/policies/{policy_a_id}/reject", json={"reason": "Please provide sensor specs"}, headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["status"] == "REJECTED"

    # Step 1.7: Gov 2 attempts re-submit on REJECTED Policy A -> must get 403
    log("Gov 2 attempting to re-submit Gov 1's REJECTED Policy A...")
    res = requests.post(f"{BASE_URL}/policies/{policy_a_id}/submit", headers=gov2_headers)
    assert res.status_code == 403, f"Expected 403 for non-creator re-submitting rejected policy, got {res.status_code}"
    log("Gov 2 re-submit attempt on REJECTED policy properly rejected with 403.")

    # Step 1.8: Gov 1 (Creator) re-submits Policy A -> succeeds
    log("Gov 1 (Creator) re-submitting Policy A...")
    res = requests.post(f"{BASE_URL}/policies/{policy_a_id}/submit", headers=gov1_headers)
    assert res.status_code == 200
    assert res.json()["status"] == "PENDING_APPROVAL"
    log("Gov 1 re-submit succeeded: Status=PENDING_APPROVAL.")

    # Step 1.9: Cleanup Policy A
    requests.delete(f"{BASE_URL}/policies/{policy_a_id}", headers=admin_headers)
    log("Cleaned up Policy A.")

    # ============================================================
    # PART 2: SCHEME CREATOR-ONLY SUBMISSION SECURITY
    # ============================================================
    log("\n--- TESTING SCHEME SUBMISSION AUTHORIZATION ---")

    # Step 2.1: Gov 1 creates Scheme A (trying to override created_by to 888)
    scheme_payload = {
        "name": "Security Test Solar Pump Scheme 2026",
        "description": "Financial subsidy for off-grid solar water pumps for small farmers.",
        "category": "Agriculture",
        "ministry": "Ministry of New and Renewable Energy",
        "department": "Department of Solar Energy",
        "state": "All India",
        "benefits": ["80% subsidy on solar pump setup"],
        "created_by": 888  # Frontend attempt to spoof created_by
    }
    res = requests.post(f"{BASE_URL}/schemes", json=scheme_payload, headers=gov1_headers)
    assert res.status_code in (200, 201), f"Scheme creation failed: {res.text}"
    scheme_a = res.json()
    scheme_a_id = scheme_a["scheme_id"]
    log(f"Scheme A created by Gov 1: ID={scheme_a_id}, Status={scheme_a['status']}, created_by={scheme_a.get('created_by')}")
    assert scheme_a["status"] == "DRAFT"
    # Ensure backend ignored spoofed created_by and used authenticated user
    assert scheme_a.get("created_by") == gov1_id, f"Backend failed to set created_by to authenticated user! Got {scheme_a.get('created_by')}"

    # Step 2.2: Gov 2 (Non-Creator) calls POST /schemes/{id}/submit directly
    log(f"Gov 2 (ID={gov2_id}) attempting to submit Gov 1's Scheme A (ID={scheme_a_id})...")
    res = requests.post(f"{BASE_URL}/schemes/{scheme_a_id}/submit", headers=gov2_headers)
    log(f"Gov 2 submit response status: {res.status_code}, response: {res.text}")
    assert res.status_code == 403, f"Expected 403 Forbidden for non-creator scheme submission, got {res.status_code}"
    error_detail = res.json().get("detail", "")
    assert "Only the user who created it can submit it for approval" in error_detail, f"Unexpected error detail: {error_detail}"
    log("Gov 2 non-creator submit properly rejected with 403 Forbidden.")

    # Step 2.3: Verify Scheme A status is UNCHANGED (still DRAFT)
    res = requests.get(f"{BASE_URL}/schemes/{scheme_a_id}", headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["status"] == "DRAFT", f"Scheme status was altered! Expected DRAFT, got {res.json()['status']}"
    log("Verified Scheme A status remained DRAFT after rejected attempt.")

    # Step 2.4: Gov 1 (Creator) submits Scheme A
    log(f"Gov 1 (Creator ID={gov1_id}) submitting Scheme A...")
    res = requests.post(f"{BASE_URL}/schemes/{scheme_a_id}/submit", headers=gov1_headers)
    assert res.status_code == 200, f"Creator scheme submit failed: {res.text}"
    assert res.json()["status"] == "PENDING_APPROVAL", f"Expected PENDING_APPROVAL, got {res.json()['status']}"
    log("Gov 1 creator submit succeeded: Status=PENDING_APPROVAL.")

    # Step 2.5: Gov 2 attempts submit again on PENDING_APPROVAL scheme -> still 403
    res = requests.post(f"{BASE_URL}/schemes/{scheme_a_id}/submit", headers=gov2_headers)
    assert res.status_code == 403, f"Expected 403 for non-creator even when pending, got {res.status_code}"
    log("Gov 2 attempt on PENDING_APPROVAL scheme properly rejected with 403.")

    # Step 2.6: Admin rejects Scheme A with reason
    log("Admin rejecting Scheme A to test REJECTED re-submit authorization...")
    res = requests.post(f"{BASE_URL}/schemes/{scheme_a_id}/reject", json={"reason": "Please provide capacity specs"}, headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["status"] == "REJECTED"

    # Step 2.7: Gov 2 attempts re-submit on REJECTED Scheme A -> must get 403
    log("Gov 2 attempting to re-submit Gov 1's REJECTED Scheme A...")
    res = requests.post(f"{BASE_URL}/schemes/{scheme_a_id}/submit", headers=gov2_headers)
    assert res.status_code == 403, f"Expected 403 for non-creator re-submitting rejected scheme, got {res.status_code}"
    log("Gov 2 re-submit attempt on REJECTED scheme properly rejected with 403.")

    # Step 2.8: Gov 1 (Creator) re-submits Scheme A -> succeeds
    log("Gov 1 (Creator) re-submitting Scheme A...")
    res = requests.post(f"{BASE_URL}/schemes/{scheme_a_id}/submit", headers=gov1_headers)
    assert res.status_code == 200
    assert res.json()["status"] == "PENDING_APPROVAL"
    log("Gov 1 re-submit succeeded: Status=PENDING_APPROVAL.")

    # Step 2.9: Cleanup Scheme A
    requests.delete(f"{BASE_URL}/schemes/{scheme_a_id}", headers=admin_headers)
    log("Cleaned up Scheme A.")

    # ============================================================
    # PART 3: ADMIN WORKFLOW PRESERVATION
    # ============================================================
    log("\n--- TESTING ADMIN WORKFLOW PRESERVATION ---")

    # Admin creates Policy B
    res = requests.post(f"{BASE_URL}/policies", json={
        "title": "Admin Security Test Policy 2026",
        "description": "Admin created test policy",
        "category": "Technology",
        "ministry": "Ministry of Electronics & IT",
        "department": "Department of IT",
        "state": "All India",
        "sector": "Information Technology"
    }, headers=admin_headers)
    assert res.status_code in (200, 201)
    admin_pol_id = res.json()["policy_id"]

    # Admin submits Policy B
    res = requests.post(f"{BASE_URL}/policies/{admin_pol_id}/submit", headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["status"] == "PENDING_APPROVAL"
    log("Admin policy submit succeeded.")

    # Cleanup Admin policy
    requests.delete(f"{BASE_URL}/policies/{admin_pol_id}", headers=admin_headers)

    # Admin creates Scheme B
    res = requests.post(f"{BASE_URL}/schemes", json={
        "name": "Admin Security Test Scheme 2026",
        "description": "Admin created test scheme",
        "category": "Technology",
        "ministry": "Ministry of Electronics & IT",
        "department": "Department of IT",
        "state": "All India"
    }, headers=admin_headers)
    assert res.status_code in (200, 201)
    admin_sch_id = res.json()["scheme_id"]

    # Admin submits Scheme B
    res = requests.post(f"{BASE_URL}/schemes/{admin_sch_id}/submit", headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["status"] == "PENDING_APPROVAL"
    log("Admin scheme submit succeeded.")

    # Cleanup Admin scheme
    requests.delete(f"{BASE_URL}/schemes/{admin_sch_id}", headers=admin_headers)

    log("\n==================================================")
    log("ALL CREATOR-ONLY SUBMISSION SECURITY TESTS PASSED!")
    log("==================================================")

if __name__ == "__main__":
    test_creator_submission_security()
