from pydantic import BaseModel, Field


class ChatContext(BaseModel):
    page: str | None = None


class ChatMessageRequest(BaseModel):
    message: str = Field(min_length=1, max_length=5000)
    conversation_id: int | None = None
    context: ChatContext | None = None


class ChatAction(BaseModel):
    label: str
    type: str
    route: str | None = None
    entity_type: str | None = None
    entity_id: int | str | None = None


class ChatSource(BaseModel):
    kind: str
    id: int | str | None = None
    title: str


class ChatResultItem(BaseModel):
    """One structured result card (policy/scheme/statistic/user/...).

    Only real database values — never fabricated by the LLM layer.
    """

    type: str = "policy"
    id: int | str | None = None
    title: str = ""
    subtitle: str | None = None
    status: str | None = None
    ministry: str | None = None
    category: str | None = None
    state: str | None = None
    route: str | None = None
    extra: dict = {}


class ChatMessageResponse(BaseModel):
    success: bool = True
    conversation_id: int
    message: str
    intent: str
    sources: list[ChatSource] = []
    actions: list[ChatAction] = []
    guest_remaining: int | None = None
    # Structured payload: {response_type, count/total/page/page_size,
    # filters, profile, ...}. Absent (None) for legacy plain replies.
    data: dict | None = None
    results: list[ChatResultItem] = []


class ChatHistoryMessage(BaseModel):
    message_id: int
    sender: str
    message: str
    intent: str | None = None
    created_at: str
    # Structured assistant payload stored at reply time (actions, results,
    # data, sources) so reopening a conversation restores its cards,
    # buttons and eligibility metadata. None for user turns / legacy rows.
    payload: dict | None = None


class ChatHistoryResponse(BaseModel):
    conversation_id: int
    messages: list[ChatHistoryMessage] = []


class ChatConversationItem(BaseModel):
    conversation_id: int
    role: str | None = None
    message_count: int = 0
    # Derived from the first user message; None for empty conversations.
    title: str | None = None
    # Most recent message preview; None for empty conversations.
    preview: str | None = None
    created_at: str = ""
    updated_at: str = ""


class ChatConversationListResponse(BaseModel):
    conversations: list[ChatConversationItem] = []


class ChatConversationCreateResponse(BaseModel):
    conversation_id: int


class ChatConfigResponse(BaseModel):
    enabled: bool
    guest_message_limit: int
    max_message_length: int
    max_history: int


class ChatUsageResponse(BaseModel):
    message_count: int
    guest_limit: int | None = None
    guest_remaining: int | None = None
