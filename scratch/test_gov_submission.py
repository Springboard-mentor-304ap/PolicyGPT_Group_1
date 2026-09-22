import requests

BASE_URL = "http://localhost:8000"

# 1. Login as Gov Official
print("Logging in as Government Official...")
res = requests.post(f"{BASE_URL}/auth/login", json={"identifier": "govt@gmail.com", "password": "Gov@1234"})
print("Login status:", res.status_code)
assert res.status_code == 200, res.text
gov_token = res.json()["access_token"]
gov_headers = {"Authorization": f"Bearer {gov_token}", "Content-Type": "application/json"}

# 2. Test saving draft via POST /policies/draft
draft_payload = {
    "title": "Test Draft Policy Via API 2026",
    "description": "A draft policy description for testing.",
    "category": "Education",
    "ministry": None,
    "department": None,
    "state": "All India",
    "sector": None,
    "publication_date": None,
    "effective_date": None,
    "document_url": None,
    "source_url": None,
    "benefits": [],
    "eligibility_rules": [
        {"rule_type": "TARGET_BENEFICIARIES", "value": "Students"}
    ]
}

print("Calling POST /policies/draft...")
res = requests.post(f"{BASE_URL}/policies/draft", json=draft_payload, headers=gov_headers)
print("Draft status:", res.status_code)
print("Draft response:", res.text)
assert res.status_code in (200, 201), res.text
policy = res.json()
policy_id = policy.get("policy_id")
print(f"Policy ID: {policy_id}, status: {policy.get('status')}")

# 3. Test submitting draft via POST /policies/{id}/submit
print(f"Calling POST /policies/{policy_id}/submit...")
res = requests.post(f"{BASE_URL}/policies/{policy_id}/submit", json={}, headers=gov_headers)
print("Submit status:", res.status_code)
print("Submit response:", res.text)
assert res.status_code == 200, res.text
submitted_policy = res.json()
print("Submitted policy status:", submitted_policy.get("status"))
