from datetime import datetime
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models.policy import Policy

from app.models.eligibility_rule import EligibilityRule
from app.models.scheme import Scheme
from app.schemas.eligibility import (
    EligibilityCheckRequest,
    EligibilityCheckResponse,
    EligibilityRuleResponse,
    MatchedScheme,
    SchemeMatchRequest,
    SchemeMatchResponse,
    PolicyEligibilityCheckRequest,
    PolicyEligibilityCheckResponse,
    PolicyEligibilityRuleResponse,
    PolicyMatchRequest,
    PolicyMatchResponse,
    MatchedPolicy,
)

# =========================================================
# HELPER
# =========================================================

def normalize(value: str | None) -> str:
    if value is None:
        return ""

    return value.strip().lower()


def is_any(value: str | None) -> bool:
    if value is None:
        return True

    return normalize(value) in {
        "",
        "any",
        "all",
        "all india",
        "not applicable",
        "n/a",
    }


def text_matches(
    user_value: str | None,
    rule_value: str | None,
) -> bool:

    # No rule means no restriction
    if rule_value is None:
        return True

    # ANY means no restriction
    if is_any(rule_value):
        return True

    if user_value is None:
        return False

    user = normalize(user_value)
    rule = normalize(rule_value)

    # Exact match
    if user == rule:
        return True

    # Handle combined categories such as:
    # SC/OBC/EWS/DNT/Safai Mitra
    if "/" in rule:
        allowed_values = [
            normalize(item)
            for item in rule.split("/")
        ]

        if user in allowed_values:
            return True

    # Handle comma-separated values
    if "," in rule:
        allowed_values = [
            normalize(item)
            for item in rule.split(",")
        ]

        if user in allowed_values:
            return True

    return False


# =========================================================
# GET ELIGIBILITY RULES
# =========================================================

def get_eligibility_rules(
    db: Session,
    scheme_id: int,
) -> list[EligibilityRule]:

    scheme = db.get(Scheme, scheme_id)

    if not scheme:
        raise HTTPException(
            status_code=404,
            detail="Scheme not found",
        )

    rules = db.scalars(
        select(EligibilityRule)
        .where(
            EligibilityRule.scheme_id == scheme_id
        )
        .order_by(EligibilityRule.rule_id)
    ).all()

    return list(rules)

# =========================================================
# GET POLICY ELIGIBILITY RULES
# =========================================================

def get_policy_eligibility_rules(
    db: Session,
    policy_id: int,
) -> list[EligibilityRule]:

    policy = db.get(
        Policy,
        policy_id,
    )

    if not policy:
        raise HTTPException(
            status_code=404,
            detail="Policy not found",
        )

    rules = db.scalars(
        select(EligibilityRule)
        .where(
            EligibilityRule.policy_id == policy_id
        )
        .order_by(EligibilityRule.rule_id)
    ).all()

    return list(rules)

# =========================================================
# CHECK ONE RULE
# =========================================================

def check_rule(
    rule: EligibilityRule,
    data: EligibilityCheckRequest,
) -> tuple[list[str], list[str]]:

    matched_rules: list[str] = []
    failed_rules: list[str] = []

    # -----------------------------------------------------
    # AGE
    # -----------------------------------------------------

    if rule.min_age is not None:

        if data.age >= rule.min_age:
            matched_rules.append(
                f"Minimum age requirement satisfied ({rule.min_age})"
            )
        else:
            failed_rules.append(
                f"Age must be at least {rule.min_age}"
            )

    if rule.max_age is not None:

        if data.age <= rule.max_age:
            matched_rules.append(
                f"Maximum age requirement satisfied ({rule.max_age})"
            )
        else:
            failed_rules.append(
                f"Age must not exceed {rule.max_age}"
            )

    # -----------------------------------------------------
    # GENDER
    # -----------------------------------------------------

    if is_any(rule.gender):

        matched_rules.append(
            "Gender requirement has no restriction"
        )

    elif text_matches(data.gender, rule.gender):

        matched_rules.append(
            "Gender requirement satisfied"
        )

    else:

        failed_rules.append(
            f"Gender must be {rule.gender}"
        )

    # -----------------------------------------------------
    # INCOME
    # -----------------------------------------------------

    if rule.max_income is None:

        matched_rules.append(
            "Income requirement has no restriction"
        )

    elif data.annual_income is None:

        failed_rules.append(
            "Annual income is required"
        )

    elif data.annual_income <= (rule.max_income):

        matched_rules.append(
            "Income requirement satisfied"
        )

    else:

        failed_rules.append(
            f"Annual income must not exceed ₹{rule.max_income}"
        )

    # -----------------------------------------------------
    # OCCUPATION
    # -----------------------------------------------------

    if is_any(rule.occupation):

        matched_rules.append(
            "Occupation requirement has no restriction"
        )

    elif text_matches(
        data.occupation,
        rule.occupation,
    ):

        matched_rules.append(
            "Occupation requirement satisfied"
        )

    else:

        failed_rules.append(
            f"Occupation must be {rule.occupation}"
        )

    # -----------------------------------------------------
    # EDUCATION
    # -----------------------------------------------------

    if is_any(rule.education):

        matched_rules.append(
            "Education requirement has no restriction"
        )

    elif text_matches(
        data.education,
        rule.education,
    ):

        matched_rules.append(
            "Education requirement satisfied"
        )

    else:

        failed_rules.append(
            f"Education requirement: {rule.education}"
        )

    # -----------------------------------------------------
    # STATE
    # -----------------------------------------------------

    if is_any(rule.state):

        matched_rules.append(
            "State requirement has no restriction"
        )

    elif normalize(rule.state) == "all india":

        matched_rules.append(
            "Scheme is available across India"
        )

    elif text_matches(
        data.state,
        rule.state,
    ):

        matched_rules.append(
            "State requirement satisfied"
        )

    else:

        failed_rules.append(
            f"State eligibility is {rule.state}"
        )

    # -----------------------------------------------------
    # SOCIAL CATEGORY
    # -----------------------------------------------------

    if is_any(rule.social_category):

        matched_rules.append(
            "Social category requirement has no restriction"
        )

    elif text_matches(
        data.social_category,
        rule.social_category,
    ):

        matched_rules.append(
            "Social category requirement satisfied"
        )

    else:

        failed_rules.append(
            f"Social category must satisfy {rule.social_category}"
        )

    # -----------------------------------------------------
    # DISABILITY
    # -----------------------------------------------------

    if rule.disability_status is None:

        matched_rules.append(
            "Disability status has no restriction"
        )

    elif data.disability_status is None:

        failed_rules.append(
            "Disability status is required"
        )

    elif data.disability_status == rule.disability_status:

        matched_rules.append(
            "Disability requirement satisfied"
        )

    else:

        required_status = (
            "disabled"
            if rule.disability_status
            else "non-disabled"
        )

        failed_rules.append(
            f"Applicant must be {required_status}"
        )

    return matched_rules, failed_rules


# =========================================================
# CHECK ELIGIBILITY
# =========================================================

def check_eligibility(
    db: Session,
    data: EligibilityCheckRequest,
) -> EligibilityCheckResponse:

    scheme = db.get(
        Scheme,
        data.scheme_id,
    )

    if not scheme:

        raise HTTPException(
            status_code=404,
            detail="Scheme not found",
        )

    # -----------------------------------------------------
    # ONLY APPROVED SCHEMES
    # -----------------------------------------------------

    if scheme.status != "APPROVED":

        raise HTTPException(
            status_code=404,
            detail="Scheme not found",
        )

    rules = get_eligibility_rules(
        db=db,
        scheme_id=data.scheme_id,
    )

    if not rules:

        return EligibilityCheckResponse(
            scheme_id=scheme.scheme_id,
            scheme_name=scheme.name,
            eligible=True,
            message=(
                "No eligibility restrictions are defined "
                "for this scheme."
            ),
            matched_rules=[
                "No eligibility restrictions found"
            ],
            failed_rules=[],
        )

    all_matched_rules: list[str] = []
    all_failed_rules: list[str] = []

    # -----------------------------------------------------
    # CURRENT DATABASE DESIGN SUPPORTS RULE RECORDS.
    #
    # For multiple rules, a user qualifies if ANY complete
    # rule is satisfied.
    # -----------------------------------------------------

    rule_results = []

    for rule in rules:

        matched, failed = check_rule(
            rule,
            data,
        )

        rule_results.append(
            (matched, failed)
        )

    # A complete rule has no failed conditions
    successful_rules = [
        result
        for result in rule_results
        if not result[1]
    ]

    if successful_rules:

        matched = successful_rules[0][0]

        return EligibilityCheckResponse(
            scheme_id=scheme.scheme_id,
            scheme_name=scheme.name,
            eligible=True,
            message="You are eligible for this scheme.",
            matched_rules=matched,
            failed_rules=[],
        )

    # -----------------------------------------------------
    # NOT ELIGIBLE
    # -----------------------------------------------------

    for matched, failed in rule_results:

        all_matched_rules.extend(matched)
        all_failed_rules.extend(failed)

    return EligibilityCheckResponse(
        scheme_id=scheme.scheme_id,
        scheme_name=scheme.name,
        eligible=False,
        message="You are not eligible for this scheme.",
        matched_rules=list(dict.fromkeys(all_matched_rules)),
        failed_rules=list(dict.fromkeys(all_failed_rules)),
    )


# =========================================================
# CHECK POLICY ELIGIBILITY
# =========================================================

def check_policy_eligibility(
    db: Session,
    data: PolicyEligibilityCheckRequest,
) -> PolicyEligibilityCheckResponse:

    policy = db.get(
        Policy,
        data.policy_id,
    )

    if not policy:
        raise HTTPException(
            status_code=404,
            detail="Policy not found",
        )

    # -----------------------------------------------------
    # ONLY APPROVED POLICIES
    # -----------------------------------------------------

    if policy.status != "APPROVED":

        raise HTTPException(
            status_code=404,
            detail="Policy not found",
        )

    # -----------------------------------------------------
    # GET POLICY RULES
    # -----------------------------------------------------

    rules = get_policy_eligibility_rules(
        db=db,
        policy_id=data.policy_id,
    )

    # -----------------------------------------------------
    # NO ELIGIBILITY RULES
    # -----------------------------------------------------

    if not rules:

        return PolicyEligibilityCheckResponse(
            policy_id=policy.policy_id,
            policy_name=policy.title,
            eligible=True,
            message=(
                "No eligibility restrictions are defined "
                "for this policy."
            ),
            matched_rules=[
                "No eligibility restrictions found"
            ],
            failed_rules=[],
        )

    # -----------------------------------------------------
    # CHECK EACH POLICY RULE
    # -----------------------------------------------------

    rule_results = []

    for rule in rules:

        matched, failed = check_rule(
            rule,
            data,
        )

        rule_results.append(
            (matched, failed)
        )

    # -----------------------------------------------------
    # ANY COMPLETE RULE = ELIGIBLE
    # -----------------------------------------------------

    successful_rules = [
        result
        for result in rule_results
        if not result[1]
    ]

    if successful_rules:

        matched = successful_rules[0][0]

        return PolicyEligibilityCheckResponse(
            policy_id=policy.policy_id,
            policy_name=policy.title,
            eligible=True,
            message="You are eligible for this policy.",
            matched_rules=matched,
            failed_rules=[],
        )

    # -----------------------------------------------------
    # NOT ELIGIBLE
    # -----------------------------------------------------

    all_matched_rules: list[str] = []
    all_failed_rules: list[str] = []

    for matched, failed in rule_results:

        all_matched_rules.extend(matched)
        all_failed_rules.extend(failed)

    return PolicyEligibilityCheckResponse(
        policy_id=policy.policy_id,
        policy_name=policy.name,
        eligible=False,
        message="You are not eligible for this policy.",
        matched_rules=list(
            dict.fromkeys(all_matched_rules)
        ),
        failed_rules=list(
            dict.fromkeys(all_failed_rules)
        ),
    )
# =========================================================
# MATCH USER WITH ALL APPROVED SCHEMES
# =========================================================

def match_schemes(
    db: Session,
    data: SchemeMatchRequest,
) -> SchemeMatchResponse:

    schemes = db.scalars(
        select(Scheme)
        .where(
            Scheme.status == "APPROVED"
        )
        .order_by(Scheme.scheme_id)
    ).all()

    eligible_schemes: list[MatchedScheme] = []
    ineligible_schemes: list[MatchedScheme] = []

    for scheme in schemes:

        request = EligibilityCheckRequest(
            scheme_id=scheme.scheme_id,
            age=data.age,
            gender=data.gender,
            annual_income=data.annual_income,
            occupation=data.occupation,
            education=data.education,
            state=data.state,
            social_category=data.social_category,
            disability_status=data.disability_status,
        )

        result = check_eligibility(
            db=db,
            data=request,
        )

        matched_scheme = MatchedScheme(
            scheme_id=scheme.scheme_id,
            scheme_name=scheme.name,
            eligible=result.eligible,
            message=result.message,
        )

        if result.eligible:

            eligible_schemes.append(
                matched_scheme
            )

        else:

            ineligible_schemes.append(
                matched_scheme
            )

    return SchemeMatchResponse(
        total_schemes_checked=len(schemes),
        eligible_schemes=eligible_schemes,
        ineligible_schemes=ineligible_schemes,
    )

# =========================================================
# MATCH USER WITH ALL APPROVED POLICIES
# =========================================================

def match_policies(
    db: Session,
    data: PolicyMatchRequest,
) -> PolicyMatchResponse:

    policies = db.scalars(
        select(Policy)
        .where(
            Policy.status == "APPROVED"
        )
        .order_by(Policy.policy_id)
    ).all()

    eligible_policies: list[MatchedPolicy] = []
    ineligible_policies: list[MatchedPolicy] = []

    for policy in policies:

        request = PolicyEligibilityCheckRequest(
            policy_id=policy.policy_id,
            age=data.age,
            gender=data.gender,
            annual_income=data.annual_income,
            occupation=data.occupation,
            education=data.education,
            state=data.state,
            social_category=data.social_category,
            disability_status=data.disability_status,
        )

        result = check_policy_eligibility(
            db=db,
            data=request,
        )

        matched_policy = MatchedPolicy(
            policy_id=policy.policy_id,
            policy_name=policy.title,
            eligible=result.eligible,
            message=result.message,
        )

        if result.eligible:

            eligible_policies.append(
                matched_policy
            )

        else:

            ineligible_policies.append(
                matched_policy
            )

    return PolicyMatchResponse(
        total_policies_checked=len(policies),
        eligible_policies=eligible_policies,
        ineligible_policies=ineligible_policies,
    )
# =========================================================
# CREATE ELIGIBILITY RULE
# =========================================================

def create_eligibility_rule(
    db: Session,
    scheme_id: int,
    data,
):

    scheme = db.get(
        Scheme,
        scheme_id,
    )

    if not scheme:

        raise HTTPException(
            status_code=404,
            detail="Scheme not found",
        )

    rule = EligibilityRule(
    scheme_id=scheme_id,
    min_age=data.min_age,
    max_age=data.max_age,
    gender=data.gender,
    max_income=data.max_income,
    occupation=data.occupation,
    education=data.education,
    state=data.state,
    social_category=data.social_category,
    disability_status=data.disability_status,
    created_at=datetime.utcnow(),
)

    db.add(rule)
    db.commit()
    db.refresh(rule)

    return rule
# =========================================================
# UPDATE POLICY ELIGIBILITY RULE
# =========================================================

def update_policy_eligibility_rule(
    db: Session,
    rule_id: int,
    data,
):
    rule = db.get(
        EligibilityRule,
        rule_id,
    )

    if not rule:
        raise HTTPException(
            status_code=404,
            detail="Eligibility rule not found",
        )

    if rule.policy_id is None:
        raise HTTPException(
            status_code=400,
            detail="This eligibility rule belongs to a scheme",
        )

    update_data = data.model_dump(
        exclude_unset=True
    )

    for field, value in update_data.items():
        setattr(rule, field, value)

    db.commit()
    db.refresh(rule)

    return rule
# =========================================================
# DELETE POLICY ELIGIBILITY RULE
# =========================================================

def delete_policy_eligibility_rule(
    db: Session,
    rule_id: int,
):
    rule = db.get(
        EligibilityRule,
        rule_id,
    )

    if not rule:
        raise HTTPException(
            status_code=404,
            detail="Eligibility rule not found",
        )

    if rule.policy_id is None:
        raise HTTPException(
            status_code=400,
            detail="This eligibility rule belongs to a scheme",
        )

    db.delete(rule)
    db.commit()

    return {
        "message": "Policy eligibility rule deleted successfully",
        "rule_id": rule_id,
    }
# =========================================================
# CREATE POLICY ELIGIBILITY RULE
# =========================================================

def create_policy_eligibility_rule(
    db: Session,
    policy_id: int,
    data,
):

    policy = db.get(
        Policy,
        policy_id,
    )

    if not policy:

        raise HTTPException(
            status_code=404,
            detail="Policy not found",
        )

    rule = EligibilityRule(
        policy_id=policy_id,
        min_age=data.min_age,
        max_age=data.max_age,
        gender=data.gender,
        max_income=data.max_income,
        occupation=data.occupation,
        education=data.education,
        state=data.state,
        social_category=data.social_category,
        disability_status=data.disability_status,
        created_at=datetime.utcnow(),
    )

    db.add(rule)
    db.commit()
    db.refresh(rule)

    return rule

# =========================================================
# UPDATE RULE
# =========================================================

def update_eligibility_rule(
    db: Session,
    rule_id: int,
    data,
):

    rule = db.get(
        EligibilityRule,
        rule_id,
    )

    if not rule:

        raise HTTPException(
            status_code=404,
            detail="Eligibility rule not found",
        )

    update_data = data.model_dump(
        exclude_unset=True
    )

    for field, value in update_data.items():

        setattr(
            rule,
            field,
            value,
        )

    db.commit()
    db.refresh(rule)

    return rule


# =========================================================
# DELETE RULE
# =========================================================

def delete_eligibility_rule(
    db: Session,
    rule_id: int,
):

    rule = db.get(
        EligibilityRule,
        rule_id,
    )

    if not rule:

        raise HTTPException(
            status_code=404,
            detail="Eligibility rule not found",
        )

    db.delete(rule)
    db.commit()

    return {
        "message": "Eligibility rule deleted successfully",
        "rule_id": rule_id,
    }