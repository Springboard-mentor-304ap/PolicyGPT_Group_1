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


class ChatMessageResponse(BaseModel):
    success: bool = True
    conversation_id: int
    message: str
    intent: str
    sources: list[ChatSource] = []
    actions: list[ChatAction] = []
    guest_remaining: int | None = None


class ChatHistoryMessage(BaseModel):
    message_id: int
    sender: str
    message: str
    intent: str | None = None
    created_at: str


class ChatHistoryResponse(BaseModel):
    conversation_id: int
    messages: list[ChatHistoryMessage] = []


class ChatConfigResponse(BaseModel):
    enabled: bool
    guest_message_limit: int
    max_message_length: int
    max_history: int


class ChatUsageResponse(BaseModel):
    message_count: int
    guest_limit: int | None = None
    guest_remaining: int | None = None
