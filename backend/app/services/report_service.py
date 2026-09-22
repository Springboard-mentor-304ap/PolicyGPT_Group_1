from sqlalchemy.orm import Session

from app.services.analytics_service import (
    get_dashboard_analytics,
    get_policy_analytics,
    get_scheme_analytics,
    get_user_analytics,
    get_department_analytics,
    get_usage_statistics,
)


def generate_report(
    db: Session,
    report_type: str
):
    report_type = report_type.upper()

    if report_type == "DASHBOARD":
        return get_dashboard_analytics(db)

    if report_type == "POLICY":
        return get_policy_analytics(db)

    if report_type == "SCHEME":
        return get_scheme_analytics(db)

    if report_type == "USER":
        return get_user_analytics(db)

    if report_type == "DEPARTMENT":
        return get_department_analytics(db)

    if report_type == "USAGE":
        return get_usage_statistics(db)

    raise ValueError(
        f"Unsupported report type: {report_type}"
    )