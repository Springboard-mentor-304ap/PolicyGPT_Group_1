from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.eligibility_rule import EligibilityRule
from app.models.policy import Policy
from app.models.scheme import Scheme

from app.schemas.eligibility import (
    EligibilityCheckRequest,
    EligibilityCheckResponse,
    EligibilityMatchRequest,
    EligibilityMatchResponse,
    EligibilityProfile,
    EligibilityRuleCreate,
    EligibilityRuleUpdate,
)

# =========================================================
# HELPERS
# =========================================================


def now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


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

    if rule_value is None:
        return True

    if is_any(rule_value):
        return True

    if user_value is None:
        return False

    user = normalize(user_value)
    rule = normalize(rule_value)

    if user == rule:
        return True

    if "/" in rule:
        values = [normalize(value) for value in rule.split("/")]

        if user in values:
            return True

    if "," in rule:
        values = [normalize(value) for value in rule.split(",")]

        if user in values:
            return True

    return False


# =========================================================
# ENTITY HELPERS
# =========================================================


def get_entity(
    db: Session,
    entity_type: str,
    entity_id: int,
) -> Policy | Scheme:

    entity_type = normalize(entity_type)

    if entity_type == "policy":

        entity = db.get(
            Policy,
            entity_id,
        )

        if entity is None:
            raise HTTPException(
                status_code=404,
                detail="Policy not found",
            )

        return entity

    if entity_type == "scheme":

        entity = db.get(
            Scheme,
            entity_id,
        )

        if entity is None:
            raise HTTPException(
                status_code=404,
                detail="Scheme not found",
            )

        return entity

    raise HTTPException(
        status_code=400,
        detail="entity_type must be 'policy' or 'scheme'",
    )


def get_entity_name(
    entity_type: str,
    entity: Policy | Scheme,
) -> str:

    if normalize(entity_type) == "policy":
        return entity.title

    return entity.name


def entity_is_approved(
    entity: Policy | Scheme,
) -> bool:

    return normalize(entity.status) == "approved"


# =========================================================
# JSONB SYNC
# =========================================================
#
# The database now contains:
#
# policies.eligibility_rules JSONB
# schemes.eligibility_rules JSONB
#
# The existing eligibility_rules table is still maintained.
# These helpers keep both representations synchronized.
# =========================================================


def rule_to_dict(
    rule: EligibilityRule,
) -> dict[str, Any]:

    return {
        "rule_id": rule.rule_id,
        "min_age": rule.min_age,
        "max_age": rule.max_age,
        "gender": rule.gender,
        "max_income": (
            float(rule.max_income) if rule.max_income is not None else None
        ),
        "occupation": rule.occupation,
        "education": rule.education,
        "state": rule.state,
        "social_category": rule.social_category,
        "disability_status": rule.disability_status,
        "is_active": rule.is_active,
    }


def sync_entity_eligibility_rules(
    db: Session,
    entity_type: str,
    entity_id: int,
) -> None:

    entity_type = normalize(entity_type)

    entity = get_entity(
        db=db,
        entity_type=entity_type,
        entity_id=entity_id,
    )

    if entity_type == "policy":

        rules = db.scalars(
            select(EligibilityRule)
            .where(
                EligibilityRule.policy_id == entity_id,
                EligibilityRule.is_active.is_(True),
            )
            .order_by(EligibilityRule.rule_id)
        ).all()

    else:

        rules = db.scalars(
            select(EligibilityRule)
            .where(
                EligibilityRule.scheme_id == entity_id,
                EligibilityRule.is_active.is_(True),
            )
            .order_by(EligibilityRule.rule_id)
        ).all()

    entity.eligibility_rules = [rule_to_dict(rule) for rule in rules]

    entity.updated_at = now()


# =========================================================
# GET ACTIVE RULES
# =========================================================


def get_eligibility_rules(
    db: Session,
    entity_type: str,
    entity_id: int,
) -> list[EligibilityRule]:

    get_entity(
        db=db,
        entity_type=entity_type,
        entity_id=entity_id,
    )

    entity_type = normalize(entity_type)

    if entity_type == "policy":

        rules = db.scalars(
            select(EligibilityRule)
            .where(
                EligibilityRule.policy_id == entity_id,
                EligibilityRule.is_active.is_(True),
            )
            .order_by(EligibilityRule.rule_id)
        ).all()

    else:

        rules = db.scalars(
            select(EligibilityRule)
            .where(
                EligibilityRule.scheme_id == entity_id,
                EligibilityRule.is_active.is_(True),
            )
            .order_by(EligibilityRule.rule_id)
        ).all()

    return list(rules)


# =========================================================
# CHECK ONE RULE
# =========================================================


def check_rule(
    rule: EligibilityRule,
    data: EligibilityProfile,
) -> tuple[list[str], list[str]]:

    matched: list[str] = []
    failed: list[str] = []

    # =====================================================
    # AGE
    # =====================================================

    if rule.min_age is not None:

        if data.age >= rule.min_age:

            matched.append(
                f"Minimum age requirement satisfied ({rule.min_age})"
            )

        else:

            failed.append(f"Age must be at least {rule.min_age}")

    if rule.max_age is not None:

        if data.age <= rule.max_age:

            matched.append(
                f"Maximum age requirement satisfied ({rule.max_age})"
            )

        else:

            failed.append(f"Age must not exceed {rule.max_age}")

    # =====================================================
    # GENDER
    # =====================================================

    if is_any(rule.gender):

        matched.append("Gender requirement has no restriction")

    elif text_matches(
        data.gender,
        rule.gender,
    ):

        matched.append("Gender requirement satisfied")

    else:

        failed.append(f"Gender must be {rule.gender}")

    # =====================================================
    # INCOME
    # =====================================================

    if rule.max_income is None:

        matched.append("Income requirement has no restriction")

    elif data.annual_income is None:

        failed.append("Annual income is required")

    elif data.annual_income <= Decimal(str(rule.max_income)):

        matched.append("Income requirement satisfied")

    else:

        failed.append(f"Annual income must not exceed ₹{rule.max_income}")

    # =====================================================
    # OCCUPATION
    # =====================================================

    if is_any(rule.occupation):

        matched.append("Occupation requirement has no restriction")

    elif text_matches(
        data.occupation,
        rule.occupation,
    ):

        matched.append("Occupation requirement satisfied")

    else:

        failed.append(f"Occupation must be {rule.occupation}")

    # =====================================================
    # EDUCATION
    # =====================================================

    if is_any(rule.education):

        matched.append("Education requirement has no restriction")

    elif text_matches(
        data.education,
        rule.education,
    ):

        matched.append("Education requirement satisfied")

    else:

        failed.append(f"Education requirement: {rule.education}")

    # =====================================================
    # STATE
    # =====================================================

    if is_any(rule.state):

        matched.append("State requirement has no restriction")

    elif normalize(rule.state) == "all india":

        matched.append("Available across India")

    elif text_matches(
        data.state,
        rule.state,
    ):

        matched.append("State requirement satisfied")

    else:

        failed.append(f"State eligibility is {rule.state}")

    # =====================================================
    # SOCIAL CATEGORY
    # =====================================================

    if is_any(rule.social_category):

        matched.append("Social category has no restriction")

    elif text_matches(
        data.social_category,
        rule.social_category,
    ):

        matched.append("Social category requirement satisfied")

    else:

        failed.append(f"Social category must satisfy {rule.social_category}")

    # =====================================================
    # DISABILITY
    # =====================================================

    if rule.disability_status is None:

        matched.append("Disability status has no restriction")

    elif data.disability_status is None:

        failed.append("Disability status is required")

    elif data.disability_status == rule.disability_status:

        matched.append("Disability requirement satisfied")

    else:

        required = "disabled" if rule.disability_status else "non-disabled"

        failed.append(f"Applicant must be {required}")

    return matched, failed


# =========================================================
# EVALUATE RULES
# =========================================================


def evaluate_rules(
    rules: list[EligibilityRule],
    data: EligibilityProfile,
) -> tuple[bool, list[str], list[str]]:

    if not rules:

        return (
            True,
            ["No eligibility restrictions found"],
            [],
        )

    results: list[tuple[list[str], list[str]]] = []

    for rule in rules:

        matched, failed = check_rule(
            rule,
            data,
        )

        results.append(
            (
                matched,
                failed,
            )
        )

    # =====================================================
    # OR LOGIC
    #
    # If at least one complete rule passes,
    # applicant is eligible.
    # =====================================================

    successful = [result for result in results if not result[1]]

    if successful:

        return (
            True,
            successful[0][0],
            [],
        )

    # =====================================================
    # ALL RULES FAILED
    # =====================================================

    matched_rules: list[str] = []
    failed_rules: list[str] = []

    for matched, failed in results:

        matched_rules.extend(matched)
        failed_rules.extend(failed)

    return (
        False,
        list(dict.fromkeys(matched_rules)),
        list(dict.fromkeys(failed_rules)),
    )


# =========================================================
# CHECK ONE POLICY OR SCHEME
# =========================================================


def check_eligibility(
    db: Session,
    data: EligibilityCheckRequest,
) -> EligibilityCheckResponse:

    entity = get_entity(
        db=db,
        entity_type=data.entity_type,
        entity_id=data.entity_id,
    )

    # Only approved entities can be checked
    if not entity_is_approved(entity):

        raise HTTPException(
            status_code=404,
            detail=f"{data.entity_type.capitalize()} not found",
        )

    rules = get_eligibility_rules(
        db=db,
        entity_type=data.entity_type,
        entity_id=data.entity_id,
    )

    eligible, matched, failed = evaluate_rules(
        rules,
        data,
    )

    entity_name = get_entity_name(
        data.entity_type,
        entity,
    )

    if eligible:

        message = f"You are eligible for this " f"{data.entity_type}."

    else:

        message = f"You are not eligible for this " f"{data.entity_type}."

    return EligibilityCheckResponse(
        entity_type=data.entity_type,
        entity_id=data.entity_id,
        entity_name=entity_name,
        eligible=eligible,
        message=message,
        matched_rules=matched,
        failed_rules=failed,
    )


# =========================================================
# MATCH ALL APPROVED POLICIES OR SCHEMES
# =========================================================


def match_entities(
    db: Session,
    data: EligibilityMatchRequest,
) -> EligibilityMatchResponse:

    entity_type = data.entity_type

    # =====================================================
    # GET APPROVED ENTITIES
    # =====================================================

    if entity_type == "policy":

        entities = db.scalars(
            select(Policy)
            .where(Policy.status == "APPROVED")
            .order_by(Policy.policy_id)
        ).all()

        entity_ids = [e.policy_id for e in entities]
        all_rules = (
            db.scalars(
                select(EligibilityRule)
                .where(
                    EligibilityRule.policy_id.in_(entity_ids),
                    EligibilityRule.is_active.is_(True),
                )
                .order_by(EligibilityRule.rule_id)
            ).all()
            if entity_ids
            else []
        )
        rules_by_entity: dict[int, list] = {}
        for r in all_rules:
            rules_by_entity.setdefault(r.policy_id, []).append(r)

    else:

        entities = db.scalars(
            select(Scheme)
            .where(Scheme.status == "APPROVED")
            .order_by(Scheme.scheme_id)
        ).all()

        entity_ids = [e.scheme_id for e in entities]
        all_rules = (
            db.scalars(
                select(EligibilityRule)
                .where(
                    EligibilityRule.scheme_id.in_(entity_ids),
                    EligibilityRule.is_active.is_(True),
                )
                .order_by(EligibilityRule.rule_id)
            ).all()
            if entity_ids
            else []
        )
        rules_by_entity = {}
        for r in all_rules:
            rules_by_entity.setdefault(r.scheme_id, []).append(r)

    eligible_entities: list[dict[str, Any]] = []

    ineligible_entities: list[dict[str, Any]] = []

    # =====================================================
    # CHECK EACH ENTITY (rules already batched: no per-entity query)
    # =====================================================

    for entity in entities:

        if entity_type == "policy":

            entity_id = entity.policy_id

        else:

            entity_id = entity.scheme_id

        rules = rules_by_entity.get(entity_id, [])

        eligible, _, _ = evaluate_rules(
            list(rules),
            data,
        )

        entity_name = get_entity_name(
            entity_type,
            entity,
        )

        result = {
            "entity_id": entity_id,
            "entity_name": entity_name,
            "eligible": eligible,
            "message": (
                f"You are eligible for this " f"{entity_type}."
                if eligible
                else f"You are not eligible for this " f"{entity_type}."
            ),
        }

        if eligible:

            eligible_entities.append(result)

        else:

            ineligible_entities.append(result)

    # =====================================================
    # RETURN
    # =====================================================

    return EligibilityMatchResponse(
        entity_type=entity_type,
        total_checked=len(entities),
        eligible_entities=eligible_entities,
        ineligible_entities=ineligible_entities,
    )


# =========================================================
# VALIDATE RULE
# =========================================================


def validate_rule(
    data: EligibilityRuleCreate | EligibilityRuleUpdate,
) -> None:

    if (
        data.min_age is not None
        and data.max_age is not None
        and data.min_age > data.max_age
    ):

        raise HTTPException(
            status_code=422,
            detail="min_age cannot be greater than max_age",
        )

    if data.min_age is not None and data.min_age < 0:

        raise HTTPException(
            status_code=422,
            detail="min_age cannot be negative",
        )

    if data.max_age is not None and data.max_age < 0:

        raise HTTPException(
            status_code=422,
            detail="max_age cannot be negative",
        )

    if data.max_income is not None and data.max_income < 0:

        raise HTTPException(
            status_code=422,
            detail="max_income cannot be negative",
        )


# =========================================================
# CREATE RULE
# =========================================================


def create_eligibility_rule(
    db: Session,
    entity_type: str,
    entity_id: int,
    data: EligibilityRuleCreate,
) -> EligibilityRule:

    get_entity(
        db=db,
        entity_type=entity_type,
        entity_id=entity_id,
    )

    validate_rule(data)

    entity_type = normalize(entity_type)

    current_time = now()

    rule = EligibilityRule(
        policy_id=(entity_id if entity_type == "policy" else None),
        scheme_id=(entity_id if entity_type == "scheme" else None),
        min_age=data.min_age,
        max_age=data.max_age,
        gender=data.gender,
        max_income=data.max_income,
        occupation=data.occupation,
        education=data.education,
        state=data.state,
        social_category=data.social_category,
        disability_status=data.disability_status,
        is_active=True,
        created_at=current_time,
        updated_at=current_time,
    )

    db.add(rule)

    db.flush()

    # Synchronize JSONB field
    sync_entity_eligibility_rules(
        db=db,
        entity_type=entity_type,
        entity_id=entity_id,
    )

    db.commit()

    db.refresh(rule)

    return rule


# =========================================================
# UPDATE RULE
# =========================================================


def update_eligibility_rule(
    db: Session,
    rule_id: int,
    data: EligibilityRuleUpdate,
) -> EligibilityRule:

    rule = db.get(
        EligibilityRule,
        rule_id,
    )

    if rule is None:

        raise HTTPException(
            status_code=404,
            detail="Eligibility rule not found",
        )

    update_data = data.model_dump(exclude_unset=True)

    # =====================================================
    # FINAL VALUES
    # =====================================================

    min_age = update_data.get(
        "min_age",
        rule.min_age,
    )

    max_age = update_data.get(
        "max_age",
        rule.max_age,
    )

    max_income = update_data.get(
        "max_income",
        rule.max_income,
    )

    # =====================================================
    # VALIDATE
    # =====================================================

    validation_data = EligibilityRuleUpdate(
        min_age=min_age,
        max_age=max_age,
        max_income=max_income,
    )

    validate_rule(validation_data)

    # =====================================================
    # APPLY UPDATES
    # =====================================================

    for field, value in update_data.items():

        setattr(
            rule,
            field,
            value,
        )

    rule.updated_at = now()

    db.flush()

    # =====================================================
    # SYNC PARENT JSONB
    # =====================================================

    entity_type = "policy" if rule.policy_id is not None else "scheme"

    entity_id = (
        rule.policy_id if rule.policy_id is not None else rule.scheme_id
    )

    sync_entity_eligibility_rules(
        db=db,
        entity_type=entity_type,
        entity_id=entity_id,
    )

    db.commit()

    db.refresh(rule)

    return rule


# =========================================================
# HARD DELETE RULE
# ADMIN ONLY
# =========================================================


def delete_eligibility_rule(
    db: Session,
    rule_id: int,
) -> dict[str, Any]:

    rule = db.get(
        EligibilityRule,
        rule_id,
    )

    if rule is None:

        raise HTTPException(
            status_code=404,
            detail="Eligibility rule not found",
        )

    # Save parent information before deleting
    entity_type = "policy" if rule.policy_id is not None else "scheme"

    entity_id = (
        rule.policy_id if rule.policy_id is not None else rule.scheme_id
    )

    db.delete(rule)

    db.flush()

    # =====================================================
    # SYNC PARENT JSONB AFTER DELETE
    # =====================================================

    sync_entity_eligibility_rules(
        db=db,
        entity_type=entity_type,
        entity_id=entity_id,
    )

    db.commit()

    return {
        "message": "Eligibility rule deleted successfully",
        "rule_id": rule_id,
    }
