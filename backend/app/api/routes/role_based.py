from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.api.routes.auth import get_current_user
from app.models.user import User

router = APIRouter(
    prefix="/role",
    tags=["Role Based APIs"],
)

def get_user_role(current_user: User) -> str:

    role = str(current_user.role).upper()

    if "." in role:
        role = role.split(".")[-1]

    if role == "ADMINISTRATOR":
        role = "ADMIN"

    return role


def require_roles(
    current_user: User,
    allowed_roles: list[str]
):
    role = get_user_role(current_user)

    if role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this resource."
        )

    return current_user