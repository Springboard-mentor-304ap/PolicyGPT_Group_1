from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.policy import Policy
from app.models.scheme import Scheme


def get_departments(db: Session):
    policy_departments = (
        db.query(Policy.department).filter(Policy.is_deleted.is_(False))
        .filter(Policy.department.isnot(None))
        .distinct()
        .all()
    )

    scheme_departments = (
        db.query(Scheme.department).filter(Scheme.is_deleted.is_(False))
        .filter(Scheme.department.isnot(None))
        .distinct()
        .all()
    )

    departments = set()

    for row in policy_departments:
        if row[0]:
            departments.add(row[0])

    for row in scheme_departments:
        if row[0]:
            departments.add(row[0])

    return [
        {
            "department": department,
        }
        for department in sorted(departments)
    ]


def get_department_analytics(
    db: Session,
    department: str,
    approved_only: bool = False,
):
    if approved_only:
        approved_policies = (
            db.query(func.count(Policy.policy_id))
            .filter(
                Policy.department == department,
                Policy.status == "APPROVED",
            )
            .scalar()
            or 0
        )

        approved_schemes = (
            db.query(func.count(Scheme.scheme_id))
            .filter(
                Scheme.department == department,
                Scheme.status == "APPROVED",
            )
            .scalar()
            or 0
        )

        # Public-safe: never reveal unpublished totals.
        return {
            "department": department,
            "total_policies": approved_policies,
            "total_schemes": approved_schemes,
            "approved_policies": approved_policies,
            "approved_schemes": approved_schemes,
        }

    total_policies = (
        db.query(func.count(Policy.policy_id))
        .filter(Policy.department == department)
        .scalar()
        or 0
    )

    total_schemes = (
        db.query(func.count(Scheme.scheme_id))
        .filter(Scheme.department == department)
        .scalar()
        or 0
    )

    approved_policies = (
        db.query(func.count(Policy.policy_id))
        .filter(
            Policy.department == department,
            Policy.status == "APPROVED",
        )
        .scalar()
        or 0
    )

    approved_schemes = (
        db.query(func.count(Scheme.scheme_id))
        .filter(
            Scheme.department == department,
            Scheme.status == "APPROVED",
        )
        .scalar()
        or 0
    )

    return {
        "department": department,
        "total_policies": total_policies,
        "total_schemes": total_schemes,
        "approved_policies": approved_policies,
        "approved_schemes": approved_schemes,
    }


def get_department_policies(
    db: Session,
    department: str,
    approved_only: bool = False,
):
    query = db.query(Policy).filter(Policy.is_deleted.is_(False)).filter(Policy.department == department)
    if approved_only:
        query = query.filter(Policy.status == "APPROVED")
    return query.order_by(Policy.created_at.desc()).all()


def get_department_schemes(
    db: Session,
    department: str,
    approved_only: bool = False,
):
    query = db.query(Scheme).filter(Scheme.is_deleted.is_(False)).filter(Scheme.department == department)
    if approved_only:
        query = query.filter(Scheme.status == "APPROVED")
    return query.order_by(Scheme.created_at.desc()).all()