from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.api.routes.auth import get_current_user, require_roles
from app.models.user import User

from app.services.analytics_service import (
    get_dashboard_analytics,
    get_policy_analytics,
    get_scheme_analytics,
    get_policy_trends,
    get_scheme_usage,
    get_user_analytics,
    get_user_activity,
    get_usage_statistics,
    get_role_analytics,
)

from app.services.department_analytics_service import (
    get_departments,
    get_department_analytics,
    get_department_policies,
    get_department_schemes,
)


router = APIRouter(
    prefix="/analytics",
    tags=["Analytics"],
)


# ============================================================
# GENERAL ANALYTICS
# ============================================================

@router.get("/dashboard")
def dashboard_analytics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(
        current_user,
        [
            "CITIZEN",
            "RESEARCHER",
            "ORGANIZATION",
            "GOVERNMENT_OFFICIAL",
            "ADMIN",
        ],
    )

    return get_dashboard_analytics(
        db=db,
        user_id=current_user.user_id,
        user_role=current_user.role,
    )


@router.get("/policies")
def policy_analytics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(
        current_user,
        [
            "CITIZEN",
            "RESEARCHER",
            "ORGANIZATION",
            "GOVERNMENT_OFFICIAL",
            "ADMIN",
        ],
    )

    return get_policy_analytics(db)


@router.get("/schemes")
def scheme_analytics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(
        current_user,
        [
            "CITIZEN",
            "RESEARCHER",
            "ORGANIZATION",
            "GOVERNMENT_OFFICIAL",
            "ADMIN",
        ],
    )

    return get_scheme_analytics(db)


@router.get("/policies/trends")
def policy_trends(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(
        current_user,
        [
            "CITIZEN",
            "RESEARCHER",
            "ORGANIZATION",
            "GOVERNMENT_OFFICIAL",
            "ADMIN",
        ],
    )

    return get_policy_trends(db)


@router.get("/schemes/usage")
def scheme_usage(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(
        current_user,
        [
            "CITIZEN",
            "RESEARCHER",
            "ORGANIZATION",
            "GOVERNMENT_OFFICIAL",
            "ADMIN",
        ],
    )

    return get_scheme_usage(db)


# ============================================================
# USER ANALYTICS
# ============================================================

@router.get("/users")
def user_analytics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(
        current_user,
        [
            "CITIZEN",
            "RESEARCHER",
            "ORGANIZATION",
            "GOVERNMENT_OFFICIAL",
            "ADMIN",
        ],
    )

    return get_user_analytics(
        db=db,
        user_id=current_user.user_id,
        user_role=current_user.role,
    )


@router.get("/users/activity")
def user_activity(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(
        current_user,
        [
            "CITIZEN",
            "RESEARCHER",
            "ORGANIZATION",
            "GOVERNMENT_OFFICIAL",
            "ADMIN",
        ],
    )

    return get_user_activity(
        db=db,
        user_id=current_user.user_id,
        user_role=current_user.role,
    )


# ============================================================
# USAGE ANALYTICS
# ============================================================

@router.get("/usage")
def usage_statistics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(
        current_user,
        [
            "CITIZEN",
            "RESEARCHER",
            "ORGANIZATION",
            "GOVERNMENT_OFFICIAL",
            "ADMIN",
        ],
    )

    return get_usage_statistics(
        db=db,
        user_id=current_user.user_id,
        user_role=current_user.role,
    )


# ============================================================
# ROLE ANALYTICS
# ============================================================

@router.get("/role")
def role_analytics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(
        current_user,
        [
            "CITIZEN",
            "RESEARCHER",
            "ORGANIZATION",
            "GOVERNMENT_OFFICIAL",
            "ADMIN",
        ],
    )

    return get_role_analytics(
        db,
        current_user,
    )


# ============================================================
# DEPARTMENT ANALYTICS
# ============================================================

@router.get("/departments")
def list_departments(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(
        current_user,
        [
            "RESEARCHER",
            "GOVERNMENT_OFFICIAL",
            "ADMIN",
        ],
    )

    return get_departments(db)


@router.get("/departments/{department}")
def department_analytics(
    department: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(
        current_user,
        [
            "RESEARCHER",
            "GOVERNMENT_OFFICIAL",
            "ADMIN",
        ],
    )

    return get_department_analytics(
        db,
        department,
    )


@router.get("/departments/{department}/policies")
def department_policies(
    department: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(
        current_user,
        [
            "RESEARCHER",
            "GOVERNMENT_OFFICIAL",
            "ADMIN",
        ],
    )

    return get_department_policies(
        db,
        department,
    )


@router.get("/departments/{department}/schemes")
def department_schemes(
    department: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(
        current_user,
        [
            "RESEARCHER",
            "GOVERNMENT_OFFICIAL",
            "ADMIN",
        ],
    )

    return get_department_schemes(
        db,
        department,
    )