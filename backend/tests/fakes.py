"""Shared in-memory doubles for chatbot tests.

FakeSession mimics just enough of the SQLAlchemy Session API for the
chatbot persistence layer (plain query/filter/order_by/limit/all/first/
count/delete/add/commit/refresh). Retrieval helpers from other services
degrade gracefully against it (empty result sets).
"""

from app.models.chatbot import (
    ChatbotConversation,
    ChatbotMessage,
    ChatbotUsage,
)


class FakeQuery:
    def __init__(self, session, model):
        self._session = session
        self._model = model
        self._filters: list = []
        self._limit: int | None = None

    def _match(self, obj) -> bool:
        for attr, value in self._filters:
            if getattr(obj, attr, None) != value:
                return False
        return True

    def _rows(self) -> list:
        rows = [
            obj for obj in self._session._store.get(self._model, [])
            if self._match(obj)
        ]
        if self._limit is not None:
            rows = rows[: self._limit]
        return rows

    def filter(self, *criteria):
        for criterion in self._extract_equals(criteria):
            self._filters.append(criterion)
        return self

    def _extract_equals(self, criteria):
        """Pull simple `column == value` pairs out of SQLAlchemy clauses."""
        pairs = []
        for criterion in criteria:
            pairs.extend(self._walk(criterion))
        return pairs

    def _walk(self, clause):
        pairs = []
        # BinaryExpression like Model.field == value. SQLAlchemy wraps
        # literals in BindParameter (has .value); columns lack .value.
        left = getattr(clause, "left", None)
        right = getattr(clause, "right", None)
        operator = getattr(clause, "operator", None)
        if left is not None and right is not None and operator is not None:
            name = getattr(operator, "__name__", "")
            key = getattr(left, "key", None)
            if key and name == "eq":
                if hasattr(right, "value"):
                    pairs.append((key, right.value))
                elif not hasattr(right, "key"):
                    pairs.append((key, right))
                return pairs
        # BooleanClauseList (and_/or_): only follow `and_` safely.
        if getattr(clause, "operator", None) is not None:
            name = getattr(getattr(clause, "operator", None), "__name__", "")
            if name == "and_":
                for sub in getattr(clause, "clauses", ()):
                    pairs.extend(self._walk(sub))
        return pairs

    def order_by(self, *args):
        # Locate the newest-first ordering used by conversations.
        text = " ".join(str(a) for a in args)
        if "updated_at" in text and "DESC" in text.upper():
            self._session._order_desc = True
        return self

    def limit(self, value):
        self._limit = int(value)
        return self

    def offset(self, value):
        return self

    def all(self):
        rows = self._rows()
        if getattr(self._session, "_order_desc", False):
            rows = list(reversed(rows))
            self._session._order_desc = False
        return rows

    def first(self):
        rows = self.all()
        return rows[0] if rows else None

    def count(self):
        return len(self._rows())

    def scalar(self):
        return None

    def delete(self):
        remaining = [
            obj for obj in self._session._store.get(self._model, [])
            if not self._match(obj)
        ]
        removed = len(self._session._store.get(self._model, [])) - len(remaining)
        self._session._store[self._model] = remaining
        return removed

    def __getattr__(self, name):
        # Gracefully absorb any other chainable clause (ilike filters,
        # joins, distinct, ...) used by reused service queries.
        def chain(*args, **kwargs):
            return self

        return chain


class FakeSession:
    """Minimal Session double with autoincrement PK assignment."""

    def __init__(self):
        self._store: dict = {
            ChatbotConversation: [],
            ChatbotMessage: [],
            ChatbotUsage: [],
        }
        self._counters: dict = {}
        self._order_desc = False
        self.committed = 0

    def _next_id(self, model):
        self._counters[model] = self._counters.get(model, 0) + 1
        return self._counters[model]

    def _pk_attr(self, model):
        if model is ChatbotConversation:
            return "conversation_id"
        if model is ChatbotMessage:
            return "message_id"
        return "usage_id"

    def add(self, obj):
        model = type(obj)
        if getattr(obj, self._pk_attr(model), None) is None:
            setattr(obj, self._pk_attr(model), self._next_id(model))
        self._store.setdefault(model, []).append(obj)

    def delete(self, obj):
        model = type(obj)
        pk = self._pk_attr(model)
        self._store[model] = [
            row for row in self._store.get(model, [])
            if getattr(row, pk, None) != getattr(obj, pk, None)
        ]

    def commit(self):
        self.committed += 1

    def rollback(self):
        pass

    def refresh(self, obj):
        return obj

    def query(self, model):
        return FakeQuery(self, model)

    def close(self):
        pass


def make_user(user_id: int = 1, role: str = "CITIZEN"):
    from app.models.user import User

    return User(user_id=user_id, role=role, full_name="Test User")
