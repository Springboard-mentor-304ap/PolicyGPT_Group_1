from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.user import User
from app.api.routes.auth import require_roles


router = APIRouter(
    prefix="/admin",
    tags=["Administration"],
)


@router.get("/users")
def get_all_users(
    current_user: User = Depends(
        require_roles("ADMINISTRATOR")
    ),
    db: Session = Depends(get_db),
):
    """
    Return all registered users for the Administrator dashboard.

    The endpoint is protected:
    only ADMINISTRATOR users can access it.
    """

    users = (
        db.query(User)
        .order_by(User.created_at.desc())
        .all()
    )

    return [
        {
            "user_id": user.user_id,
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role,
            "phone": user.phone,
            "date_of_birth": (
                user.date_of_birth.isoformat()
                if user.date_of_birth
                else None
            ),
            "state": user.state,
            "district": user.district,
            "occupation": user.occupation,
            "organization": user.organization,
            "is_active": user.is_active,
            "created_at": (
                user.created_at.isoformat()
                if user.created_at
                else None
            ),
            "updated_at": (
                user.updated_at.isoformat()
                if user.updated_at
                else None
            ),
        }
        for user in users
    ]
