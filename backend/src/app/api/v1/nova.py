from __future__ import annotations

import json
from collections.abc import AsyncIterator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.schemas.nova import NovaDraft, NovaParseRequest, NovaStreamRequest
from app.services import nova_service

router = APIRouter(prefix="/nova", tags=["nova"])


@router.post("/parse", response_model=NovaDraft)
async def parse(data: NovaParseRequest) -> NovaDraft:
    """Turn a free-text message into a structured task draft.

    Backed by Claude Opus 4.8 when an API key is configured, otherwise a local parser.
    """
    return await nova_service.parse_text(data.text)


@router.post("/stream")
async def stream(data: NovaStreamRequest) -> StreamingResponse:
    """Stream the agent's reply token by token, then the matching card event.

    Server-Sent Events (text/event-stream). Each frame is one named event:
      delta   - a chunk of the running reply text
      draft   - the {title, description, source} task card (create intent)
      meta    - {intent, query} for list / complete / delete
      resolve - {op, task_id}; a follow-up ("yes") resolved a pending choice
      error   - friendly failure copy; the reply degraded to the local parser
      done    - the turn is finished

    `history` (recent turns) and `pending` (a card awaiting a choice) travel in
    the request body so Nova feels conversational - it is otherwise stateless.
    Backed by Claude when an API key is configured, otherwise a local parser.
    """

    async def event_source() -> AsyncIterator[bytes]:
        async for event in nova_service.stream_reply(
            data.text, history=data.history, pending=data.pending
        ):
            name = event["event"]
            payload = json.dumps(event["data"], ensure_ascii=False)
            yield f"event: {name}\ndata: {payload}\n\n".encode("utf-8")

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={
            # Defeat proxy/browser buffering so tokens arrive as they are produced.
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
