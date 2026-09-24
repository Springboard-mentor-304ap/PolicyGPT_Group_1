from sqlalchemy.orm import Session

from app.models.user import User

from app.services.analytics_service import (
    get_dashboard_analytics,
    get_policy_analytics,
    get_scheme_analytics,
    get_user_analytics,
    get_department_analytics,
    get_usage_statistics,
    get_role_analytics,
    get_policy_trends,
    get_scheme_trends,
)


# ============================================================
# GENERATE REPORT
# ============================================================

def generate_report(
    db: Session,
    report_type: str,
    user: User,
):
    report_type = report_type.upper()

    user_id = user.user_id
    user_role = user.role

    # ========================================================
    # DASHBOARD REPORT
    # ========================================================

    if report_type == "DASHBOARD":
        return get_dashboard_analytics(
            db=db,
            user_id=user_id,
            user_role=user_role,
        )

    # ========================================================
    # POLICY REPORT
    # ========================================================

    if report_type == "POLICY":
        return get_policy_analytics(db)

    # ========================================================
    # SCHEME REPORT
    # ========================================================

    if report_type == "SCHEME":
        return get_scheme_analytics(db)

    # ========================================================
    # USER REPORT
    # ========================================================

    if report_type == "USER":
        return get_user_analytics(
            db=db,
            user_id=user_id,
            user_role=user_role,
        )

    # ========================================================
    # DEPARTMENT REPORT
    # ========================================================

    if report_type == "DEPARTMENT":
        return get_department_analytics(db)

    # ========================================================
    # USAGE REPORT
    # ========================================================

    if report_type == "USAGE":
        return get_usage_statistics(
            db=db,
            user_id=user_id,
            user_role=user_role,
        )

    # ========================================================
    # ROLE REPORT
    # ========================================================

    if report_type == "ROLE":
        return get_role_analytics(
            db,
            user,
        )

    # ========================================================
    # INVALID REPORT TYPE
    # ========================================================

    raise ValueError(
        f"Unsupported report type: {report_type}"
    )


# ============================================================
# ROLE-BASED REPORTS
# ============================================================

def get_role_reports(
    db: Session,
    user: User,
):

    role = str(user.role)

    user_id = user.user_id
    user_role = user.role

    # ========================================================
    # ADMIN
    # ========================================================

    if role == "ADMIN":

        return {
            "role": "ADMIN",

            "reports": {
                "dashboard": get_dashboard_analytics(
                    db=db,
                    user_id=user_id,
                    user_role=user_role,
                ),

                "policies": get_policy_analytics(db),

                "schemes": get_scheme_analytics(db),

                "users": get_user_analytics(
                    db=db,
                    user_id=user_id,
                    user_role=user_role,
                ),

                "departments": get_department_analytics(db),

                "usage": get_usage_statistics(
                    db=db,
                    user_id=user_id,
                    user_role=user_role,
                ),
            }
        }

    # ========================================================
    # GOVERNMENT OFFICIAL
    # ========================================================

    elif role == "GOVERNMENT_OFFICIAL":

        return {
            "role": "GOVERNMENT_OFFICIAL",

            "reports": {
                "policies": get_policy_analytics(db),

                "schemes": get_scheme_analytics(db),

                "departments": get_department_analytics(db),

                "policy_trends": get_policy_trends(db),

                "scheme_trends": get_scheme_trends(db),

                "user": get_user_analytics(
                    db=db,
                    user_id=user_id,
                    user_role=user_role,
                ),

                "usage": get_usage_statistics(
                    db=db,
                    user_id=user_id,
                    user_role=user_role,
                ),
            }
        }

    # ========================================================
    # ORGANIZATION
    # ========================================================

    elif role == "ORGANIZATION":

        return {
            "role": "ORGANIZATION",

            "reports": {
                "policies": get_policy_analytics(db),

                "schemes": get_scheme_analytics(db),

                "policy_trends": get_policy_trends(db),

                "scheme_trends": get_scheme_trends(db),

                "user": get_user_analytics(
                    db=db,
                    user_id=user_id,
                    user_role=user_role,
                ),

                "usage": get_usage_statistics(
                    db=db,
                    user_id=user_id,
                    user_role=user_role,
                ),
            }
        }

    # ========================================================
    # RESEARCHER
    # ========================================================

    elif role == "RESEARCHER":

        return {
            "role": "RESEARCHER",

            "reports": {
                "policies": get_policy_analytics(db),

                "schemes": get_scheme_analytics(db),

                "policy_trends": get_policy_trends(db),

                "scheme_trends": get_scheme_trends(db),

                "departments": get_department_analytics(db),

                "user": get_user_analytics(
                    db=db,
                    user_id=user_id,
                    user_role=user_role,
                ),

                "usage": get_usage_statistics(
                    db=db,
                    user_id=user_id,
                    user_role=user_role,
                ),
            }
        }

    # ========================================================
    # CITIZEN
    # ========================================================

    elif role == "CITIZEN":

        return {
            "role": "CITIZEN",

            "reports": {
                "policies": get_policy_analytics(db),

                "schemes": get_scheme_analytics(db),

                "user": get_user_analytics(
                    db=db,
                    user_id=user_id,
                    user_role=user_role,
                ),

                "usage": get_usage_statistics(
                    db=db,
                    user_id=user_id,
                    user_role=user_role,
                ),
            }
        }

    # ========================================================
    # UNKNOWN ROLE
    # ========================================================

    else:

        return {
            "role": role,
            "reports": {},
            "message": "No reports available for this role",
        }