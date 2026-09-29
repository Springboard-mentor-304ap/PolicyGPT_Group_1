from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.report import Report
from app.models.user import User

from app.services.analytics_service import (
    get_dashboard_analytics,
    get_policy_analytics,
    get_scheme_analytics,
    get_user_analytics,
    get_user_activity,
    get_department_analytics,
    get_usage_statistics,
    get_role_analytics,
    get_policy_trends,
    get_scheme_trends,
)


# ============================================================
# GENERATE REPORT (LEGACY JSON PREVIEW)
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
# ROLE-BASED REPORTS (LEGACY JSON PREVIEW)
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


# ============================================================
# PERSISTED REPORTS (PART 2 — REAL FILES)
# ============================================================
# PENDING -> build dataset -> render bytes -> atomic write ->
# COMPLETED. On failure: delete partial file -> FAILED.


def build_v1_report_data(
    db: Session,
    report_type: str,
    user: User,
    scoped_filters: dict | None = None,
    title: str | None = None,
    detail: str | None = None,
):
    """Build the typed dataset for a V1 report type (role-scoped)."""
    from app.services import report_datasets

    normalized_type = str(report_type or "").strip().upper()
    return report_datasets.build_dataset(
        db, normalized_type, user, scoped_filters or {}, title,
        detail=detail,
    )


def _preview_of(dataset: dict) -> dict:
    """Small JSON preview for the generate response (no raw rows)."""
    return {
        "summary": dict(dataset.get("summary") or []),
        "empty": bool(dataset.get("empty")),
        "sections": len(dataset.get("sections") or []),
    }


def create_persisted_report(
    db: Session,
    user: User,
    report_type: str,
    report_format: str,
    parameters: dict | None = None,
    title: str | None = None,
    detail: str | None = None,
) -> tuple[Report, dict | list | None]:
    """Generate a V1 report with real file lifecycle.

    Returns (Report row, JSON preview). Raises ValueError (400) for
    bad input and PermissionError (403) for role violations.
    """
    from app.services import report_permissions as permissions
    from app.services import report_export_service as export
    from app.services.audit_log_service import log_action

    normalized_type = str(report_type or "").strip().upper()
    normalized_format = str(report_format or "PDF").strip().upper()

    if normalized_type not in permissions.REPORT_TYPES:
        raise ValueError(f"Unsupported report type: {report_type}")
    if normalized_format not in permissions.REPORT_FORMATS:
        raise ValueError(f"Unsupported report format: {report_format}")

    effective_detail = permissions.validate_report_detail(
        user.role, normalized_type, detail
    )
    scoped_filters = permissions.apply_report_scope(
        user.role, user.user_id, normalized_type, parameters or {},
        detail=effective_detail,
    )

    # PENDING row first so the database always reflects reality.
    report = Report(
        generated_by=user.user_id,
        report_type=normalized_type,
        report_format=normalized_format,
        title=(title or normalized_type)[:255] if title or normalized_type else None,
        status="PENDING",
        parameters=scoped_filters,
        generated_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    try:
        dataset = build_v1_report_data(
            db, normalized_type, user, scoped_filters, title,
            detail=effective_detail,
        )
        metadata = {
            "report_id": report.report_id,
            "title": report.title,
            "report_type": normalized_type,
            "report_format": normalized_format,
            "detail": effective_detail,
            "status": "COMPLETED",
            "generated_at": report.generated_at.isoformat()
            if report.generated_at
            else "",
            "filters": scoped_filters,
        }
        content = export.render_dataset(dataset, metadata, normalized_format)
        filename = export.build_filename(
            report.report_id, normalized_type, normalized_format
        )
        export.finalize_report_file(db, report, content, filename)
    except (ValueError, PermissionError):
        export.fail_report(db, report, ValueError("validation"))
        raise
    except Exception as exc:
        export.fail_report(db, report, exc)
        raise ValueError("Report generation failed. Please retry.") from exc

    log_action(
        db,
        action="GENERATE_REPORT",
        user_id=user.user_id,
        entity_type="REPORT",
        entity_id=report.report_id,
        description=f"Generated {normalized_type} ({normalized_format}, "
        f"{effective_detail})",
    )

    try:
        from app.services.notification_service import notify_report_completed

        notify_report_completed(
            db,
            user_id=user.user_id,
            report_id=report.report_id,
            report_title=report.title or normalized_type,
        )
    except Exception:
        pass

    return report, _preview_of(dataset)


def list_reports_for_user(
    db: Session, user: User, limit: int = 100, offset: int = 0
) -> list[Report]:
    """Ownership: ADMIN sees all, others see only their own (paginated)."""
    from app.api.routes.auth import normalize_role

    limit = max(1, min(int(limit or 100), 200))
    offset = max(0, int(offset or 0))
    query = db.query(Report).order_by(Report.generated_at.desc())
    if normalize_role(user.role) == "ADMIN":
        return query.offset(offset).limit(limit).all()
    return (
        query.filter(Report.generated_by == user.user_id)
        .offset(offset)
        .limit(limit)
        .all()
    )


def get_report_for_user(
    db: Session, user: User, report_id: int
) -> Report | None:
    """Return the report if visible, else None (caller maps to 404)."""
    from app.services import report_permissions as permissions

    report = (
        db.query(Report).filter(Report.report_id == report_id).first()
    )
    if not permissions.can_view_report(user, report):
        return None
    return report


def get_report_download_payload(
    db: Session, user: User, report: Report
) -> tuple[str, bytes, str]:
    """Serve the stored report file (Part 2 real download)."""
    from app.services import report_export_service as export
    from app.services.audit_log_service import log_action

    if report.status != "COMPLETED":
        raise ValueError(
            "Report is not ready for download."
            if report.status == "PENDING"
            else "Report generation failed. Please regenerate."
        )

    filename, content, media_type = export.read_report_file(report)

    log_action(
        db,
        action="DOWNLOAD_REPORT",
        user_id=user.user_id,
        entity_type="REPORT",
        entity_id=report.report_id,
        description=f"Downloaded report {report.report_id}",
    )

    return filename, content, media_type
