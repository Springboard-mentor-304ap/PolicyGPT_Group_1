from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.policy import Policy
from app.models.scheme import Scheme
from app.models.user import User
from app.models.saved_policy import SavedPolicy
from app.models.saved_scheme import SavedScheme
from app.models.search_history import SearchHistory


def get_role_analytics(db: Session, user: User):

    role = user.role

    if role == "ADMIN":

        return {
            "role": "ADMIN",

            "users": {
                "total": db.query(User).count(),

                "citizens": (
                    db.query(User)
                    .filter(User.role == "CITIZEN")
                    .count()
                ),

                "researchers": (
                    db.query(User)
                    .filter(User.role == "RESEARCHER")
                    .count()
                ),

                "organizations": (
                    db.query(User)
                    .filter(User.role == "ORGANIZATION")
                    .count()
                ),

                "government_officials": (
                    db.query(User)
                    .filter(User.role == "GOVERNMENT_OFFICIAL")
                    .count()
                ),

                "admins": (
                    db.query(User)
                    .filter(User.role == "ADMIN")
                    .count()
                )
            },

            "policies": {
                "total": db.query(Policy).count(),

                "approved": (
                    db.query(Policy)
                    .filter(Policy.status == "APPROVED")
                    .count()
                ),

                "pending": (
                    db.query(Policy)
                    .filter(Policy.status == "PENDING_APPROVAL")
                    .count()
                ),

                "rejected": (
                    db.query(Policy)
                    .filter(Policy.status == "REJECTED")
                    .count()
                ),

                "archived": (
                    db.query(Policy)
                    .filter(Policy.status == "ARCHIVED")
                    .count()
                )
            },

            "schemes": {
                "total": db.query(Scheme).count(),

                "approved": (
                    db.query(Scheme)
                    .filter(Scheme.status == "APPROVED")
                    .count()
                ),

                "pending": (
                    db.query(Scheme)
                    .filter(Scheme.status == "PENDING_APPROVAL")
                    .count()
                )
            }
        }

    elif role == "GOVERNMENT_OFFICIAL":

        return {
            "role": "GOVERNMENT_OFFICIAL",

            "policies": {
                "total": db.query(Policy).count(),

                "approved": (
                    db.query(Policy)
                    .filter(Policy.status == "APPROVED")
                    .count()
                ),

                "pending": (
                    db.query(Policy)
                    .filter(Policy.status == "PENDING_APPROVAL")
                    .count()
                ),

                "rejected": (
                    db.query(Policy)
                    .filter(Policy.status == "REJECTED")
                    .count()
                )
            },

            "schemes": {
                "total": db.query(Scheme).count(),

                "approved": (
                    db.query(Scheme)
                    .filter(Scheme.status == "APPROVED")
                    .count()
                ),

                "pending": (
                    db.query(Scheme)
                    .filter(Scheme.status == "PENDING_APPROVAL")
                    .count()
                )
            }
        }

    elif role == "ORGANIZATION":

        saved_policies = (
            db.query(SavedPolicy)
            .filter(SavedPolicy.user_id == user.user_id)
            .count()
        )

        saved_schemes = (
            db.query(SavedScheme)
            .filter(SavedScheme.user_id == user.user_id)
            .count()
        )

        searches = (
            db.query(SearchHistory)
            .filter(SearchHistory.user_id == user.user_id)
            .count()
        )

        return {
            "role": "ORGANIZATION",

            "policies": {
                "total": (
                    db.query(Policy)
                    .filter(Policy.status == "APPROVED")
                    .count()
                ),
                "saved": saved_policies
            },

            "schemes": {
                "total": (
                    db.query(Scheme)
                    .filter(Scheme.status == "APPROVED")
                    .count()
                ),
                "saved": saved_schemes
            },

            "activity": {
                "searches": searches
            }
        }

    elif role == "RESEARCHER":

        total_policies = db.query(Policy).count()

        approved_policies = (
            db.query(Policy)
            .filter(Policy.status == "APPROVED")
            .count()
        )

        total_schemes = db.query(Scheme).count()

        approved_schemes = (
            db.query(Scheme)
            .filter(Scheme.status == "APPROVED")
            .count()
        )

        return {
            "role": "RESEARCHER",

            "policy_statistics": {
                "total": total_policies,
                "approved": approved_policies,
                "approval_percentage": (
                    round(
                        (approved_policies / total_policies) * 100,
                        2
                    )
                    if total_policies > 0 else 0
                )
            },

            "scheme_statistics": {
                "total": total_schemes,
                "approved": approved_schemes,
                "approval_percentage": (
                    round(
                        (approved_schemes / total_schemes) * 100,
                        2
                    )
                    if total_schemes > 0 else 0
                )
            }
        }

    elif role == "CITIZEN":

        saved_policies = (
            db.query(SavedPolicy)
            .filter(SavedPolicy.user_id == user.user_id)
            .count()
        )

        saved_schemes = (
            db.query(SavedScheme)
            .filter(SavedScheme.user_id == user.user_id)
            .count()
        )

        searches = (
            db.query(SearchHistory)
            .filter(SearchHistory.user_id == user.user_id)
            .count()
        )

        return {
            "role": "CITIZEN",

            "available": {
                "policies": (
                    db.query(Policy)
                    .filter(Policy.status == "APPROVED")
                    .count()
                ),

                "schemes": (
                    db.query(Scheme)
                    .filter(Scheme.status == "APPROVED")
                    .count()
                )
            },

            "personal_activity": {
                "saved_policies": saved_policies,
                "saved_schemes": saved_schemes,
                "searches": searches
            }
        }

    return {
        "role": role,
        "message": "Analytics are not available for this role"
    }