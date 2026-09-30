from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.api.routes.auth import require_roles
from app.models.user import User
from app.db.database import get_db

from app.schemas.report import (
    ReportGenerateRequest,
    ReportResponse,
)
from app.services import report_permissions as permissions
from app.services.report_service import (
    create_persisted_report,
    generate_report,
    get_report_download_payload,
    get_report_for_user,
    get_role_reports,
    list_reports_for_user,
)

router = APIRouter(
    prefix="/reports",
    tags=["Reports"],
)


REPORT_ROUTE_ROLES = (
    "CITIZEN",
    "RESEARCHER",
    "ORGANIZATION",
    "GOVERNMENT_OFFICIAL",
    "ADMIN",
)


# ============================================================
# REPORT TYPES (role-scoped)
# ============================================================


@router.get("/types")
def report_types(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*REPORT_ROUTE_ROLES)),
):
    from app.services.report_datasets import get_reports_overview

    allowed = list(permissions.get_allowed_report_types(current_user.role))
    return {
        "role": current_user.role,
        "report_types": allowed,
        "report_formats": list(permissions.REPORT_FORMATS),
        "details": {
            report_type: list(permissions.REPORT_DETAILS.get(report_type, ()))
            for report_type in allowed
        },
        "overview": get_reports_overview(db, current_user),
    }


# ============================================================
# GENERATE PERSISTED REPORT (V1)
# ============================================================


@router.post("/generate")
def generate_persisted_report_endpoint(
    payload: ReportGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*REPORT_ROUTE_ROLES)),
):
    """Generate a report in memory and return the file bytes directly.

    The response is the PDF/XLSX binary with Content-Disposition and
    X-Report-Id headers. Report metadata is persisted for history;
    no file is written to the backend filesystem.
    """
    from app.services import report_export_service as export

    try:
        report, content, filename = create_persisted_report(
            db=db,
            user=current_user,
            report_type=payload.report_type,
            report_format=payload.report_format,
            parameters=payload.parameters,
            title=payload.title,
            detail=payload.detail,
        )
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return Response(
        content=content,
        media_type=export.media_type_for(payload.report_format),
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Report-Id": str(report.report_id),
        },
    )


# ============================================================
# FILTER OPTIONS (distinct live values, scoped)
# ============================================================


@router.get("/options")
def report_options(
    field: str,
    report_type: str = "POLICY_REPORT",
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*REPORT_ROUTE_ROLES)),
):
    from app.services.report_datasets import get_filter_options

    try:
        values = get_filter_options(
            db, current_user, field, report_type
        )
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"field": field, "report_type": report_type.upper(), "values": values}


# ============================================================
# REPORT HISTORY (ownership-scoped)
# ============================================================


@router.get("/history", response_model=list[ReportResponse])
def report_history(
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*REPORT_ROUTE_ROLES)),
):
    return list_reports_for_user(db, current_user, limit=limit, offset=offset)


# ============================================================
# ROLE-BASED REPORTS (deprecated JSON preview)
# ============================================================


@router.get("/role")
def role_reports(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*REPORT_ROUTE_ROLES)),
):
    return get_role_reports(
        db,
        current_user,
    )


# ============================================================
# LEGACY REPORT PREVIEW (compatibility)
# ============================================================


@router.get("/legacy/{report_type}")
def legacy_generate_report_endpoint(
    report_type: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*REPORT_ROUTE_ROLES)),
):
    try:
        return {
            "report_type": report_type.upper(),
            "data": generate_report(
                db=db,
                report_type=report_type,
                user=current_user,
            ),
        }

    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e),
        )


# ============================================================
# REPORT DETAIL (ownership: non-owner -> 404)
# ============================================================


@router.get("/{report_id:int}", response_model=ReportResponse)
def get_report_endpoint(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*REPORT_ROUTE_ROLES)),
):
    report = get_report_for_user(db, current_user, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return report


# ============================================================
# REPORT STRUCTURED DATA (native View page, no binary)
# ============================================================


@router.get("/{report_id:int}/data")
def get_report_data_endpoint(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*REPORT_ROUTE_ROLES)),
):
    """Return the rebuilt structured dataset for the View page.

    Same builders, same ownership and role scope as generation and
    download, so View, PDF and Excel always represent the same data.
    """
    from app.services.report_service import get_report_data_payload

    report = get_report_for_user(db, current_user, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if not permissions.can_download_report(current_user, report):
        raise HTTPException(status_code=404, detail="Report not found")
    if report.status != "COMPLETED":
        raise HTTPException(
            status_code=409,
            detail=(
                "Report is still being generated."
                if report.status == "PENDING"
                else "Report generation failed. Please regenerate."
            ),
        )

    try:
        return get_report_data_payload(db, current_user, report)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


# ============================================================
# REPORT DOWNLOAD (ownership: non-owner -> 404)
# ============================================================


@router.get("/{report_id:int}/download")
def download_report_endpoint(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*REPORT_ROUTE_ROLES)),
):
    report = get_report_for_user(db, current_user, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if not permissions.can_download_report(current_user, report):
        raise HTTPException(status_code=404, detail="Report not found")
    if report.status != "COMPLETED":
        raise HTTPException(
            status_code=409,
            detail=(
                "Report is still being generated."
                if report.status == "PENDING"
                else "Report generation failed. Please regenerate."
            ),
        )

    try:
        filename, content, media_type = get_report_download_payload(
            db, current_user, report
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except FileNotFoundError:
        raise HTTPException(
            status_code=404, detail="Report file is not available"
        )
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
