from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


class NovaParseRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)

    @field_validator("text")
    @classmethod
    def not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Message cannot be blank.")
        return v


class NovaDraft(BaseModel):
    """A structured task draft produced from a free-text message."""

    title: str
    description: str
    source: str  # "claude" | "local" - tells the client how the draft was produced


class NovaTurn(BaseModel):
    """One prior message in the conversation, replayed to give Nova memory."""

    role: str  # "user" | "agent"
    text: str = Field(default="", max_length=4000)


class NovaPendingTask(BaseModel):
    """A candidate task the user is being asked to choose between."""

    id: str
    title: str
    completed: bool = False


class NovaPending(BaseModel):
    """A card awaiting the user's choice or confirmation.

    When present, a short follow-up like "yes", "add it", "the first one", or
    "the completed one" is resolved against this card instead of being
    classified from scratch.

    - op "complete" | "delete" | "update": `candidates` are existing tasks; a
      follow-up picks/confirms one.
    - op "create": `draft` is a task not yet saved; "add it" / "yes" confirms it.
    - op "create_many": `drafts` is a batch of planned tasks not yet saved; "yes"
      / "add them all" confirms creating every one.
    - op "delete_all": clear every task; no candidates/draft - a plain "yes"
      confirms the are-you-sure, anything else cancels.
    """

    op: str  # "complete" | "delete" | "update" | "create" | "create_many" | "delete_all"
    candidates: list[NovaPendingTask] = Field(default_factory=list, max_length=10)
    draft: NovaDraft | None = None  # only for op == "create"
    # Only for op == "create_many": the planned tasks awaiting one-tap add.
    drafts: list[NovaDraft] = Field(default_factory=list, max_length=30)


class NovaStreamRequest(NovaParseRequest):
    """A turn for the streaming endpoint: the new message plus enough context to
    make Nova feel conversational.

    The agent is stateless; "memory" is the client re-sending recent turns
    (`history`) and any card still awaiting a choice (`pending`) with every
    request. The backend replays `history` to the model and resolves short
    follow-ups against `pending`.
    """

    history: list[NovaTurn] = Field(default_factory=list, max_length=20)
    pending: NovaPending | None = None


class NovaIntent(BaseModel):
    """What the user wants to do, plus the bits each intent needs.

    intent: "create" | "list" | "complete" | "delete" | "delete_all" |
            "update" | "clarify" | "plan" | "unknown".
    query:  the user's words for WHICH existing task they mean (the client
            matches this against its task list for complete/delete/list).
    title/description: only meaningful for "create".
    tasks:  only meaningful for "plan" - the discrete tasks extracted from a
            planning conversation, for the user to add as a batch.
    source: "claude" | "local" - how the intent was determined.
    """

    intent: str
    query: str = ""
    title: str = ""
    description: str = ""
    tasks: list[NovaDraft] = Field(default_factory=list)
    source: str = "local"
