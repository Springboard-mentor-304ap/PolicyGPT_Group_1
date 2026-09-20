from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.policy import Policy
from app.models.scheme import Scheme


def get_departments(db: Session):
    policy_departments = (
        db.query(Policy.department)
        .filter(Policy.department.isnot(None))
        .distinct()
        .all()
    )

    scheme_departments = (
        db.query(Scheme.department)
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
):
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
):
    return (
        db.query(Policy)
        .filter(Policy.department == department)
        .order_by(Policy.created_at.desc())
        .all()
    )


def get_department_schemes(
    db: Session,
    department: str,
):
    return (
        db.query(Scheme)
        .filter(Scheme.department == department)
        .order_by(Scheme.created_at.desc())
        .all()
    )