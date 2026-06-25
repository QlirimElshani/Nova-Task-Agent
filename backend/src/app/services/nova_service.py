from __future__ import annotations

import re
from collections.abc import AsyncIterator

from app.core.config import settings
from app.schemas.nova import NovaDraft, NovaIntent, NovaPending, NovaPendingTask, NovaTurn

# How many prior turns to replay to the model. The model is stateless, so this
# is the conversational "memory window" - enough for natural follow-ups without
# blowing the token budget. The most recent turns matter most (see Echo's
# token_budget: oldest pairs are dropped first).
_HISTORY_TURNS = 6

# JSON schema the model must return - guarantees a parseable {title, description}.
_DRAFT_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "description": {"type": "string"},
    },
    "required": ["title", "description"],
    "additionalProperties": False,
}

# The intents Nova can act on. "create" produces a task draft; "list" shows the
# user's tasks; "complete"/"delete"/"update" act on an existing task the client
# matches against `query`; "delete_all" clears EVERY task (a destructive bulk
# action the client confirms before running); "clarify" is a vague/broad goal
# ("plan my week") where Nova asks what they want before drafting; "plan" is the
# follow-up once the user has answered - it breaks the goal into a BATCH of
# concrete tasks the user adds in one tap; "unknown" is a plain chat reply with
# no card. For "update", title/description carry the NEW values (either may be
# empty = leave unchanged).
INTENTS = (
    "create", "list", "complete", "delete", "delete_all", "update", "clarify",
    "plan", "unknown",
)

# Schema for intent classification. `query` is the user's words for *which*
# existing task they mean (used by complete/delete/list matching on the client);
# title/description are only meaningful for "create".
_INTENT_SCHEMA = {
    "type": "object",
    "properties": {
        "intent": {"type": "string", "enum": list(INTENTS)},
        "query": {"type": "string"},
        "title": {"type": "string"},
        "description": {"type": "string"},
    },
    "required": ["intent", "query", "title", "description"],
    "additionalProperties": False,
}

# Schema for plan extraction - the discrete tasks pulled out of a planning
# conversation. Each is a normal task draft; the client adds them as a batch.
_PLAN_SCHEMA = {
    "type": "object",
    "properties": {
        "tasks": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "description": {"type": "string"},
                },
                "required": ["title", "description"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["tasks"],
    "additionalProperties": False,
}

_SYSTEM = (
    "You turn a person's free-text note into a single structured to-do task. "
    "Return a concise, action-oriented title (max ~64 characters, no trailing "
    "punctuation) and a short one-sentence description that adds helpful context. "
    "Do not invent details the user did not imply."
)

_PLAN_SYSTEM = (
    "You are Nova, a task assistant. The conversation is a planning session: the "
    "user shared a goal (like planning their week) along with their priorities "
    "and any constraints (tasks per day, deadlines, busy days). Break that plan "
    "into a list of concrete, individually-actionable to-do tasks. Each task gets "
    "an action-oriented title (max ~64 characters, no trailing punctuation) and a "
    "short one-sentence description. Honor the user's stated limits - if they "
    "asked for 3 tasks a day across 5 days, return about 15 tasks. If a day or "
    "grouping matters, mention it in the description (e.g. 'Monday'). Use only "
    "what the user actually said; do not invent unrelated tasks. Return them in "
    "the order they should be done."
)

_INTENT_SYSTEM = (
    "You are Nova, a task assistant. Classify what the user wants to do with "
    "their to-do list. Choose exactly one intent:\n"
    "- create: they describe something new to do ('call the bank tomorrow').\n"
    "- list: they want to SEE their tasks. ANY request to show/list/view/review "
    "tasks is `list`, with or without a status filter. 'show my tasks', 'what do "
    "I have', 'what tasks do I have', 'show completed tasks', 'show me what's not "
    "done', 'do I have any tasks' are ALL `list`. Never answer a 'show tasks' "
    "request with `unknown` - you DO have access to their tasks; another part of "
    "the app renders the list, you only classify.\n"
    "- complete: mark an existing task done ('mark call the bank as completed', "
    "'I finished the groceries').\n"
    "- delete: remove ONE existing task ('delete the bank task', 'remove buy "
    "milk').\n"
    "- delete_all: remove EVERY task at once ('delete all my tasks', 'clear all "
    "tasks', 'remove everything', 'delete all', 'wipe my list', 'start over'). "
    "Use this ONLY when they clearly mean the whole list, not a single task.\n"
    "- update: change an existing task's title or description ('rename call the "
    "bank to call the credit union', 'change the bank task description to bring "
    "ID', 'edit the groceries task').\n"
    "- clarify: a BROAD or VAGUE goal that cannot become concrete tasks yet, "
    "where you should ask what they want before drafting. Use this for the FIRST "
    "open-ended planning/organizing request like 'plan my week', 'plan my day', "
    "'organize my life', 'help me be productive', 'sort out my schedule', 'I want "
    "to get my life together', 'help me plan' - WHEN you still need to ask what "
    "their goals/priorities are. A SPECIFIC actionable item is still `create` "
    "('plan the sprint demo for Friday', 'plan dinner for Saturday').\n"
    "- plan: the user is in a planning conversation (you already asked clarifying "
    "questions) and has now given enough detail - their goals/priorities and any "
    "preference like tasks-per-day or a deadline - to break the goal into "
    "concrete tasks. Use `plan` when the latest message answers your planning "
    "questions or asks you to build/go ahead with the plan ('my priorities are X, "
    "Y, Z, keep it to 3 a day', 'the demo is due Friday', 'yes go', 'build it "
    "out', 'go ahead'). The conversation history tells you a plan is underway. "
    "Do NOT use `plan` for a single concrete item - that is `create`.\n"
    "- unknown: ONLY greetings or chit-chat with no task meaning ('hi', 'thanks', "
    "'who are you', 'what's the weather').\n"
    "Set `query` to the short phrase naming WHICH task they mean (the EXISTING "
    "task's words, not the new value), plus any status word for "
    "list/complete/delete. For create, set `title` and `description` to the new "
    "task's values. For update, set `title` to the NEW title if they want to "
    "rename it (else empty) and `description` to the NEW description if they want "
    "to change it (else empty). For list/complete/delete/clarify/unknown leave "
    "title and description empty."
)

# Spoken before a card appears, tailored per intent. Kept to ONE short sentence
# so it streams in fast and reads like Nova thinking out loud.
_REPLY_SYSTEMS = {
    "create": (
        "You are Nova, a friendly task assistant. Reply in ONE short, warm "
        "sentence saying you have DRAFTED a task they can add. Do NOT say it is "
        "already added or saved - a card with an Add button follows. Do not list "
        "the task details. Plain text, no markdown, no emoji."
    ),
    "update": (
        "You are Nova, a friendly task assistant. The user wants to edit a task. "
        "In ONE short sentence, say you'll pull up the task so they can confirm "
        "the change below. Do NOT claim you already FOUND a specific task and do "
        "NOT say it is already changed - the app looks it up next and a card "
        "follows. If the user did not clearly name a task or what to change, "
        "instead ask which task and what to change. Plain text, no markdown, no "
        "emoji."
    ),
    "list": (
        "You are Nova, a friendly task assistant. In ONE short, warm sentence, "
        "say you are pulling up their tasks. Do not list any tasks yourself - a "
        "list is shown right after. Plain text, no markdown, no emoji."
    ),
    "complete": (
        "You are Nova, a friendly task assistant. The user wants to mark a task "
        "complete. In ONE short, warm sentence, say you'll pull it up so they can "
        "confirm below. Do NOT claim you already FOUND a specific task and do not "
        "assume it is done yet - the app looks it up next and a confirm card "
        "follows. Plain text, no markdown, no emoji."
    ),
    "delete": (
        "You are Nova, a friendly task assistant. The user wants to delete a task. "
        "In ONE short sentence, say you'll pull it up so they can confirm below. "
        "Do NOT claim you already FOUND a specific task and do not assume it is "
        "deleted yet - the app looks it up next and a confirm card follows. Plain "
        "text, no markdown, no emoji."
    ),
    "delete_all": (
        "You are Nova, a friendly task assistant. The user asked to delete ALL "
        "their tasks. In ONE short sentence, warn that this clears every task and "
        "cannot be undone, and ask them to confirm by replying yes. Do NOT assume "
        "anything is deleted yet. Plain text, no markdown, no emoji."
    ),
    "clarify": (
        "You are Nova, a friendly task assistant. The user gave a broad goal "
        "(like planning or organizing) that is too vague to turn into one task "
        "yet. In TWO or three short, warm sentences, ask two things so you can "
        "build a good plan: (1) what they want to achieve - their goals or "
        "priorities; and (2) a preference that shapes the plan, such as how many "
        "tasks per day they want, or how much time they have. Offer to break it "
        "into separate tasks once they answer. For example, for 'plan my week' "
        "ask what their main goals are AND how many tasks a day feels right. Do "
        "NOT draft a task and do NOT list tasks. Plain text, no markdown, no emoji."
    ),
    "plan": (
        "You are Nova, a friendly task assistant. You have broken the user's goal "
        "into a set of concrete tasks, shown in a card right below with an 'Add "
        "all' button. In ONE short, warm sentence, say you have turned their plan "
        "into tasks they can add below. Do NOT list the tasks yourself and do NOT "
        "say they are already added or saved - the card with the Add button "
        "follows and they confirm there. Plain text, no markdown, no emoji."
    ),
    "unknown": (
        "You are Nova, a friendly task assistant for THIS app - you create, list, "
        "complete, update, and delete the user's tasks, and you can plan a goal "
        "into tasks. You do NOT use or recommend other apps (Todoist, Notion, "
        "Asana). In ONE or two short sentences, gently say the request is outside "
        "what you do and suggest describing a task or asking you to plan "
        "something. Plain text, no markdown, no emoji."
    ),
}


async def parse_text(text: str) -> NovaDraft:
    """Turn free text into a task draft.

    Uses Claude Opus 4.8 (structured outputs) when an API key is configured;
    otherwise falls back to a local rule-based parser so the endpoint always works.
    """
    text = text.strip()
    if settings.nova_enabled:
        try:
            return await _parse_with_claude(text)
        except Exception:
            # Never fail the request because the model call failed - degrade locally.
            return _parse_locally(text)
    return _parse_locally(text)


async def _parse_with_claude(text: str) -> NovaDraft:
    import json

    from anthropic import AsyncAnthropic

    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    response = await client.messages.create(
        model=settings.nova_model,
        max_tokens=1024,
        system=_SYSTEM,
        output_config={"format": {"type": "json_schema", "schema": _DRAFT_SCHEMA}},
        messages=[{"role": "user", "content": text}],
    )

    # With output_config.format the first text block is guaranteed valid JSON.
    raw = next(b.text for b in response.content if b.type == "text")
    data = json.loads(raw)
    title = _clean_title(data.get("title") or text)
    description = (data.get("description") or "").strip() or _default_description(None)
    return NovaDraft(title=title, description=description, source="claude")


# ---------------------------------------------------------------------------
# Intent classification - decide what the user wants before replying.
# ---------------------------------------------------------------------------


def _history_to_messages(history: list[NovaTurn] | None) -> list[dict]:
    """Replay recent turns as Anthropic messages (the Echo replay pattern).

    Maps role 'user' -> user, 'agent' -> assistant, keeps the last
    `_HISTORY_TURNS`, and drops empty/card-only turns (an assistant turn that was
    just a card has no useful text to replay). Ensures the sequence starts with a
    user turn so the API's alternation rule is satisfied once we append the new
    message.
    """
    if not history:
        return []
    msgs: list[dict] = []
    for turn in history[-_HISTORY_TURNS:]:
        text = (turn.text or "").strip()
        if not text:
            continue
        role = "assistant" if turn.role == "agent" else "user"
        msgs.append({"role": role, "content": text})
    # Trim a leading assistant turn so history begins with a user message.
    while msgs and msgs[0]["role"] == "assistant":
        msgs.pop(0)
    return msgs


async def classify_intent(text: str, history: list[NovaTurn] | None = None) -> NovaIntent:
    """Decide whether the user wants to create / list / complete / delete a task.

    The model is good at extracting `query`/`title` but is non-deterministic
    about the intent itself - it sometimes deflects a clear "show my tasks" into
    `unknown`. So we run a deterministic local guardrail and let it OVERRIDE the
    model when the message carries an unambiguous action signal. The model still
    fills in `query`/`title`. With no key we use the local classifier outright.
    `history` gives the model conversational context for follow-ups.
    """
    text = text.strip()
    if not settings.nova_enabled:
        return _classify_locally(text)

    try:
        model_intent = await _classify_with_claude(text, history)
    except Exception:
        return _classify_locally(text)
    return _reconcile(text, model_intent)


def _reconcile(text: str, model_intent: NovaIntent) -> NovaIntent:
    """Override the model's intent with a confident local signal when they differ.

    list/complete/delete are explicit user actions; if the keyword rules clearly
    detect one, trust it over a model `unknown`/`create` (the model occasionally
    deflects). We keep the model's `query`/`title` so its better extraction is
    not lost. We do NOT override toward `create`/`unknown` - those are the
    ambiguous cases the model is better at judging.
    """
    signal = _local_signal(text)
    if (
        signal in ("list", "complete", "delete", "delete_all", "update")
        and model_intent.intent != signal
    ):
        query = model_intent.query or _query_from(text)
        # Preserve the model's new title/description for an update override.
        return NovaIntent(
            intent=signal,
            query=query,
            title=model_intent.title if signal == "update" else "",
            description=model_intent.description if signal == "update" else "",
            source="claude",
        )
    # A clearly-vague planning goal ("plan my week") should ASK first, even if the
    # model eagerly drafted a task. The clarify regex is conservative, so only
    # override the model's `create`/`unknown` (never a real action).
    if signal == "clarify" and model_intent.intent in ("create", "unknown"):
        return NovaIntent(intent="clarify", source="claude")
    return model_intent


async def _classify_with_claude(
    text: str, history: list[NovaTurn] | None = None
) -> NovaIntent:
    import json

    from anthropic import AsyncAnthropic

    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    messages = [*_history_to_messages(history), {"role": "user", "content": text}]
    response = await client.messages.create(
        model=settings.nova_model,
        max_tokens=512,
        system=_INTENT_SYSTEM,
        output_config={"format": {"type": "json_schema", "schema": _INTENT_SCHEMA}},
        messages=messages,
    )
    raw = next(b.text for b in response.content if b.type == "text")
    data = json.loads(raw)
    intent = data.get("intent")
    if intent not in INTENTS:
        intent = "create"

    raw_title = (data.get("title") or "").strip()
    raw_desc = (data.get("description") or "").strip()
    if intent == "create":
        title = _clean_title(raw_title or text)
        description = raw_desc
    elif intent == "update":
        # New values for an edit: keep only what the user actually gave (empty
        # means "leave that field unchanged"). Clean the title if present.
        title = _clean_title(raw_title) if raw_title else ""
        description = raw_desc
    else:
        title = ""
        description = ""

    # A plan needs the concrete tasks, which the classification schema does not
    # carry. Extract them in a second call; if that yields nothing, fall back to
    # clarify so we ask again rather than show an empty plan.
    tasks: list[NovaDraft] = []
    if intent == "plan":
        tasks = await _plan_with_claude(text, history)
        if not tasks:
            intent = "clarify"

    return NovaIntent(
        intent=intent,
        query=(data.get("query") or "").strip(),
        title=title,
        description=description,
        tasks=tasks,
        source="claude",
    )


async def _plan_with_claude(
    text: str, history: list[NovaTurn] | None = None
) -> list[NovaDraft]:
    """Break a planning conversation into a batch of concrete tasks.

    Replays the conversation (so the goals/priorities/deadline already discussed
    are in context) and returns discrete, addable tasks. Returns [] on any
    failure so the caller can degrade to asking again.
    """
    import json

    from anthropic import AsyncAnthropic

    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    messages = [*_history_to_messages(history), {"role": "user", "content": text}]
    response = await client.messages.create(
        model=settings.nova_model,
        max_tokens=2048,
        system=_PLAN_SYSTEM,
        output_config={"format": {"type": "json_schema", "schema": _PLAN_SCHEMA}},
        messages=messages,
    )
    raw = next(b.text for b in response.content if b.type == "text")
    data = json.loads(raw)
    drafts: list[NovaDraft] = []
    for item in data.get("tasks", [])[:30]:
        title = _clean_title((item.get("title") or "").strip())
        if not title:
            continue
        description = (item.get("description") or "").strip() or _default_description(None)
        drafts.append(NovaDraft(title=title, description=description, source="claude"))
    return drafts


# Keyword cues for the offline classifier. Order matters: a message can contain
# more than one verb, so we check the more specific actions before "create".
_LIST_RE = re.compile(
    r"\b("
    r"show|list|see|view|display|review|"
    r"what(?:'s|s| are| is| do i| do i have| have i| tasks?| are my| is my)|"
    r"which tasks?|my tasks?|all tasks?|all my tasks?|"
    r"do i have any|how many tasks?|tasks? do i"
    r")\b",
    re.IGNORECASE,
)
_COMPLETE_RE = re.compile(
    r"\b("
    r"complete[d]?|done|finish(?:ed)?|mark(?: as)?|tick off|check off|"
    r"got it done|i did|i've done"
    r")\b",
    re.IGNORECASE,
)
_DELETE_RE = re.compile(
    r"\b(delete|remove|cancel|get rid of|drop|clear|erase|trash)\b",
    re.IGNORECASE,
)
# "delete all my tasks", "clear everything", "wipe my list", "start over",
# "remove all tasks". A delete/clear verb plus an all/everything quantifier, OR a
# standalone whole-list phrase. Checked BEFORE the single-delete rule so "delete
# all" is never treated as a one-task delete.
_DELETE_ALL_RE = re.compile(
    r"\b(delete|remove|clear|erase|trash|wipe|get rid of|drop)\b[^.?!]*"
    r"\b(all|everything|every (task|one)|all (of )?(my |the )?tasks?|the (whole|entire) list)\b"
    r"|\b(wipe|clear|empty)\b[^.?!]*\b(list|tasks?|everything)\b"
    r"|\bstart over\b|\bdelete all\b|\bclear all\b|\bremove all\b",
    re.IGNORECASE,
)
_UPDATE_RE = re.compile(
    r"\b(rename|edit|update|change|rewrite|reword|set (the )?(title|description|name))\b",
    re.IGNORECASE,
)
# Broad, open-ended goals that should ask "what do you want?" before drafting.
# A plan/organize verb applied to a whole-life scope (week/day/life/schedule/
# time/everything), or a bare "help me plan / be productive / get organized".
# A SPECIFIC target after the verb ("plan the sprint demo") is left to `create`.
_CLARIFY_RE = re.compile(
    r"\b(plan|organi[sz]e|sort out|figure out|map out|structure|schedule)\b\s*"
    r"(out\s+)?(my|the|this)?\s*"
    r"\b(week|day|month|life|schedule|time|days|weeks|everything|routine|goals?|"
    r"priorities)\b"
    r"|\bhelp me (plan|organi[sz]e|be productive|get organi[sz]ed|get my life together)\b"
    r"|\b(get|getting) (my )?life together\b"
    r"|\bbe (more )?productive\b"
    r"|^\s*(plan|organi[sz]e)\s*$",
    re.IGNORECASE,
)
# Greetings / chit-chat that are clearly NOT a task to create. A short trailing
# filler ("there", "nova", "everyone") is allowed after the greeting.
_CHITCHAT_RE = re.compile(
    r"^\s*("
    r"hi|hey|hello|yo|howdy|sup|"
    r"thanks?|thank you|thx|ty|"
    r"who are you|what are you|what can you do|help|"
    r"how are you|how's it going|good (morning|afternoon|evening)|gm|gn|"
    r"ok(ay)?|cool|nice|great|awesome|nevermind|never mind"
    r")\b(\s+(there|nova|everyone|all|buddy|friend))?[\s!.?]*$",
    re.IGNORECASE,
)


def _local_signal(text: str) -> str | None:
    """A *confident* intent from deterministic keyword rules, or None.

    Returns list/complete/delete/unknown only when the message clearly carries
    that signal. Returns None for everything else (let the model / create path
    decide). Used as a guardrail over the model's intent so a clear request
    never silently becomes a deflection.
    """
    lower = text.lower()
    if _CHITCHAT_RE.match(text):
        return "unknown"
    # "delete all my tasks" must beat the list cue: the phrase "all my tasks"
    # also matches _LIST_RE, so the destructive bulk-delete signal is checked
    # first. (It already requires a delete/clear/wipe verb, so it won't swallow a
    # plain "show all my tasks".)
    if _DELETE_ALL_RE.search(lower):
        return "delete_all"
    # List cue wins over a stray status word ("show me completed tasks").
    if _LIST_RE.search(lower):
        return "list"
    if _DELETE_RE.search(lower):
        return "delete"
    # Update (rename/edit/change) before complete, since "change X to ..." is an
    # edit, not a completion.
    if _UPDATE_RE.search(lower):
        return "update"
    if _COMPLETE_RE.search(lower):
        return "complete"
    # Broad planning/organizing goal with no concrete deliverable -> ask first.
    # Checked last so an explicit task action above always wins.
    if _CLARIFY_RE.search(lower):
        return "clarify"
    return None


def _classify_locally(text: str) -> NovaIntent:
    signal = _local_signal(text)
    if signal == "unknown":
        return NovaIntent(intent="unknown")
    if signal == "list":
        return NovaIntent(intent="list", query=_query_from(text))
    if signal == "delete_all":
        return NovaIntent(intent="delete_all")
    if signal == "delete":
        return NovaIntent(intent="delete", query=_query_from(text))
    if signal == "update":
        return NovaIntent(intent="update", query=_query_from(text))
    if signal == "complete":
        return NovaIntent(intent="complete", query=_query_from(text))
    if signal == "clarify":
        return NovaIntent(intent="clarify")
    draft = _parse_locally(text)
    return NovaIntent(
        intent="create", title=draft.title, description=draft.description
    )


# Strip the action verb / filler so what's left names the task the user means.
# Status words ("completed", "not completed", "done") are deliberately KEPT so
# the client can use them to disambiguate ("delete call the bank which is
# completed") or filter a list ("show only completed tasks"). The client decides
# how to interpret a status hint per intent.
_ACTION_STRIP_RE = re.compile(
    r"\b(please|can you|could you|nova|the|tasks?|that|this|as|to|i|have|me|"
    r"mark|tick off|check off|"
    r"delete|remove|cancel|get rid of|drop|clear|"
    r"show|list|see|view|display|all|my|only|which|is|are)\b",
    re.IGNORECASE,
)


def _query_from(text: str) -> str:
    """Best-effort extraction of the task phrase from an action message.

    Keeps status words (completed / not completed / done) - they let the client
    filter or disambiguate. Only the action verbs and filler are dropped.
    """
    q = _ACTION_STRIP_RE.sub(" ", text)
    q = re.sub(r"[^\w\s]", " ", q)
    q = re.sub(r"\s{2,}", " ", q).strip()
    return q


# ---------------------------------------------------------------------------
# Streaming - yields typed events the SSE route formats and forwards to the
# client. Event shape: {"event": <name>, "data": <json-serializable dict>}.
#   delta : {"text": str}            - one chunk of the running reply
#   draft : NovaDraft fields         - the create-task card (create intent)
#   meta  : {"intent","query"}       - tells the client to list / find+act on a
#                                      task (list / complete / delete intents)
#   error : {"message": str}         - friendly failure copy (reply degraded)
#   done  : {}                       - turn finished
# The client streams the reply into the bubble, then renders the matching card.
# ---------------------------------------------------------------------------

# Canned one-liners used when no API key is configured (offline path).
_FALLBACK_REPLIES = {
    "create": "Here's a task I put together - want me to add it?",
    "list": "Here are the tasks you have right now.",
    "complete": "Let me pull that up - confirm below to mark it complete.",
    "delete": "Let me pull that up - confirm below to delete it.",
    "delete_all": "This will delete every task and can't be undone - reply yes to confirm.",
    "update": "Let me pull that up so you can confirm the change below.",
    "clarify": "Happy to help plan that. What are you hoping to get done, and how many tasks a day feels right? I'll split it into tasks for you.",
    "plan": "Here's your plan broken into tasks - add them all below.",
    "unknown": "I can help you create, list, complete, update, or delete tasks, or plan a goal into tasks - try describing a task.",
}

# Short affirmatives / selectors used to answer a pending choice ("yes", "the
# first one", "the completed one"). Resolved against the pending candidates.
_AFFIRM_RE = re.compile(
    r"^\s*(yes|yep|yeah|yup|yes please|sure|ok(ay)?|do it|go ahead|confirm|"
    r"please do|that one|sounds good|correct|right|exactly|absolutely|"
    r"finalize|proceed)\b",
    re.IGNORECASE,
)
# Verbs that, for a single pending candidate, restate-and-confirm a specific op
# ("complete it", "make it completed" -> complete; "delete it" -> delete). Kept
# op-specific so a conflicting verb ("delete it" while a COMPLETE card is open)
# does NOT hijack the wrong action - that case falls through to re-classify.
_CONFIRM_VERBS = {
    "complete": re.compile(
        r"\b(complete|completed|mark|done|finish(?:ed)?|tick|check off)\b", re.IGNORECASE
    ),
    "delete": re.compile(
        r"\b(delete|deleted|remove|removed|cancel|erase|trash|get rid)\b", re.IGNORECASE
    ),
    "update": re.compile(
        r"\b(update|change|rename|reword|rewrite|save|edit)\b", re.IGNORECASE
    ),
}
# Op-agnostic confirmations: "do it", "make it so", "go ahead and do that".
_CONFIRM_GENERIC_RE = re.compile(
    r"\b(do|make)\b.*\b(it|that|this|so|task)\b|\bgo ahead\b",
    re.IGNORECASE,
)
# Confirming a pending draft ("add it", "save it", "add to my tasks", "create it").
_ADD_RE = re.compile(
    r"\b(add|save|create|keep|store)\b.*\b(it|task|this|that|them)\b|"
    r"\badd to my tasks?\b|\badd it\b|\bsave it\b|\bcreate it\b|\byes add\b",
    re.IGNORECASE,
)
# Ordinal selectors. "one"/"two"/bare digits are deliberately excluded - "the
# bank one" or "the completed one" use "one" as a pronoun, not an index.
_ORDINAL = {
    "first": 0, "1st": 0,
    "second": 1, "2nd": 1,
    "third": 2, "3rd": 2,
    "last": -1,
}


def _resolve_pending(text: str, pending: NovaPending) -> NovaPendingTask | None:
    """Map a short follow-up to one of the pending candidates, or None.

    Handles: a plain "yes" or a restated action ("complete it", "make it
    completed") when there's a single candidate; an ordinal ("the first one"),
    a status word ("the completed one"), or a unique title word when there are
    several to choose between.
    """
    cands = pending.candidates
    if not cands:
        return None
    lower = text.lower()

    # Single candidate: an affirmative, an op-matching restatement, or a generic
    # "do it" confirms it ("yes", "complete it", "make it completed", "go ahead").
    # This is the common case behind a one-task card and must run BEFORE the
    # status-word branch, so "make it completed" reads as a confirmation - not as
    # a filter for "the completed one" (which finds nothing and loops the card).
    # The restatement is op-specific so "delete it" can't confirm a complete card.
    if len(cands) == 1:
        op_verb = _CONFIRM_VERBS.get(pending.op)
        if (
            _AFFIRM_RE.match(text)
            or _CONFIRM_GENERIC_RE.search(lower)
            or (op_verb is not None and op_verb.search(lower))
        ):
            return cands[0]

    # "yes"/"confirm" with several candidates is ambiguous - don't guess.
    if _AFFIRM_RE.match(text):
        return None

    # Ordinal selector.
    for word, idx in _ORDINAL.items():
        if re.search(rf"\b{re.escape(word)}\b", lower):
            try:
                return cands[idx]
            except IndexError:
                return None

    # Status selector ("the completed one" / "the not-done one").
    if re.search(r"\bnot\s+(completed|complete|done)\b|\bincomplete|\bactive\b", lower):
        actives = [c for c in cands if not c.completed]
        if len(actives) == 1:
            return actives[0]
    elif re.search(r"\b(completed|complete|done|finished)\b", lower):
        dones = [c for c in cands if c.completed]
        if len(dones) == 1:
            return dones[0]

    # Title-word selector: a candidate whose title shares a meaningful word with
    # the reply, uniquely.
    words = {w for w in re.findall(r"\w+", lower) if len(w) > 2}
    if words:
        hits = [c for c in cands if words & set(re.findall(r"\w+", c.title.lower()))]
        if len(hits) == 1:
            return hits[0]
    return None


async def stream_reply(
    text: str,
    history: list[NovaTurn] | None = None,
    pending: NovaPending | None = None,
) -> AsyncIterator[dict]:
    """Classify intent, stream a short reply, then emit the matching card event.

    `history` (recent turns) gives the reply and classifier conversational
    context; `pending` lets a short follow-up ("yes", "the first one") resolve
    against a card already awaiting a choice. Uses Claude when a key is set;
    otherwise canned replies. Never raises - failures degrade to a friendly error
    delta plus a best-effort local result, then `done`.
    """
    text = text.strip()

    # If a card is awaiting a choice/confirmation and this message is a short
    # answer to it, resolve it directly instead of re-classifying ("yes"/"add it"
    # have no intent on their own). This is what makes pick-list -> "the first
    # one" and draft -> "add it" work, and stops Nova claiming "added" without
    # actually creating the task.
    if pending is not None:
        # A pending DRAFT confirmed by "add it" / "yes" -> create it.
        if pending.op == "create" and pending.draft is not None:
            if _AFFIRM_RE.match(text) or _ADD_RE.search(text.lower()):
                yield {"event": "delta", "data": {"text": "Done - adding that task now."}}
                yield {
                    "event": "resolve",
                    "data": {"op": "create", "draft": pending.draft.model_dump()},
                }
                yield {"event": "done", "data": {}}
                return
        # A pending PLAN confirmed by "yes" / "add them all" -> create every task.
        # This is what makes "yes go" / "have you added these?" actually add the
        # planned tasks instead of leaving them as suggestions.
        elif pending.op == "create_many" and pending.drafts:
            if _AFFIRM_RE.match(text) or _ADD_RE.search(text.lower()):
                n = len(pending.drafts)
                yield {
                    "event": "delta",
                    "data": {"text": f"Done - adding all {n} tasks now."},
                }
                yield {
                    "event": "resolve",
                    "data": {
                        "op": "create_many",
                        "drafts": [d.model_dump() for d in pending.drafts],
                    },
                }
                yield {"event": "done", "data": {}}
                return
        # A pending DELETE-ALL confirmed by "yes" -> clear every task. There are
        # no candidates to pick; it is a plain are-you-sure the user answers.
        elif pending.op == "delete_all":
            if _AFFIRM_RE.match(text):
                yield {"event": "delta", "data": {"text": "Done - clearing all your tasks now."}}
                yield {"event": "resolve", "data": {"op": "delete_all"}}
                yield {"event": "done", "data": {}}
                return
            # Anything other than a yes cancels the bulk delete.
            yield {
                "event": "delta",
                "data": {"text": "Okay, I left your tasks as they are."},
            }
            yield {"event": "done", "data": {}}
            return
        else:
            chosen = _resolve_pending(text, pending)
            if chosen is not None:
                verb = {"complete": "complete", "delete": "delete", "update": "update"}.get(
                    pending.op, pending.op
                )
                yield {
                    "event": "delta",
                    "data": {"text": f"Done - I'll {verb} that one."},
                }
                yield {
                    "event": "resolve",
                    "data": {"op": pending.op, "task_id": chosen.id},
                }
                yield {"event": "done", "data": {}}
                return

    intent = await classify_intent(text, history)

    if not settings.nova_enabled:
        # Offline: one canned reply line, then the matching trailing event.
        yield {"event": "delta", "data": {"text": _FALLBACK_REPLIES[intent.intent]}}
        async for event in _trailing_events(text, intent):
            yield event
        yield {"event": "done", "data": {}}
        return

    try:
        async for chunk in _stream_reply_with_claude(text, intent.intent, history):
            yield {"event": "delta", "data": {"text": chunk}}
    except Exception:
        yield {
            "event": "error",
            "data": {"message": "I had trouble reaching my brain just now, but here's what I can do."},
        }

    async for event in _trailing_events(text, intent):
        yield event
    yield {"event": "done", "data": {}}


async def _trailing_events(text: str, intent: NovaIntent) -> AsyncIterator[dict]:
    """Emit the card event that matches the classified intent.

    create -> draft (built by Claude or locally). Other intents -> a `meta`
    event the client uses to list tasks or find+confirm an action; unknown
    emits nothing (the reply text stands alone).
    """
    if intent.intent == "create":
        if intent.source == "claude" and intent.title:
            draft = NovaDraft(
                title=intent.title,
                description=intent.description or _default_description(None),
                source="claude",
            )
        else:
            try:
                draft = (
                    await _parse_with_claude(text)
                    if settings.nova_enabled
                    else _parse_locally(text)
                )
            except Exception:
                draft = _parse_locally(text)
        yield {"event": "draft", "data": draft.model_dump()}
    elif intent.intent == "update":
        # Carry the proposed new title/description so the client can show the
        # change for confirmation.
        yield {
            "event": "meta",
            "data": {
                "intent": "update",
                "query": intent.query,
                "title": intent.title,
                "description": intent.description,
            },
        }
    elif intent.intent == "plan":
        # The whole point of the fix: a plan emits the batch of tasks as a card
        # the user adds in one tap (and "yes"/"add them all" confirms via the
        # create_many pending). Without this, a planned week was prose only.
        yield {
            "event": "plan",
            "data": {"tasks": [t.model_dump() for t in intent.tasks]},
        }
    elif intent.intent == "delete_all":
        # No query/candidates - the client shows an are-you-sure card and sends a
        # delete_all pending so a "yes" follow-up resolves to the bulk delete.
        yield {"event": "meta", "data": {"intent": "delete_all", "query": ""}}
    elif intent.intent in ("list", "complete", "delete"):
        yield {
            "event": "meta",
            "data": {"intent": intent.intent, "query": intent.query},
        }
    # clarify / unknown: no card - the reply text (asking what they want, or
    # declining) stands on its own.


async def _stream_reply_with_claude(
    text: str, intent: str, history: list[NovaTurn] | None = None
) -> AsyncIterator[str]:
    from anthropic import AsyncAnthropic

    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    system = _REPLY_SYSTEMS.get(intent, _REPLY_SYSTEMS["create"])
    messages = [*_history_to_messages(history), {"role": "user", "content": text}]
    async with client.messages.stream(
        model=settings.nova_model,
        max_tokens=256,
        system=system,
        messages=messages,
    ) as stream:
        async for token in stream.text_stream:
            if token:
                yield token


# ---------------------------------------------------------------------------
# Local fallback - ported from the design's parseTask() so behavior matches
# the mockup when no API key is present.
# ---------------------------------------------------------------------------

_DUE_WORDS = (
    "tomorrow",
    "tonight",
    "today",
    "next week",
    "this week",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
)

_PREFIX_RE = re.compile(
    r"^(hey,?\s*|please\s*|can you\s*)?(nova,?\s*)?"
    r"(remind me to|remind me|add (a )?task( to)?|create (a )?task( to)?|"
    r"new task( to)?|i need to|i have to|i want to|i should|note to|todo:?|to-?do:?)\s*",
    re.IGNORECASE,
)

_DUE_STRIP_RE = re.compile(
    r"\b(by |before |on |this )?(" + "|".join(_DUE_WORDS) + r")\b",
    re.IGNORECASE,
)


def _detect_due(text: str) -> str | None:
    lower = text.lower()
    if re.search(r"\btomorrow\b", lower):
        return "tomorrow"
    if re.search(r"\btonight\b|\btoday\b", lower):
        return "today"
    if re.search(r"\bnext week\b", lower):
        return "next week"
    m = re.search(
        r"\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b", lower
    )
    if m:
        return m.group(1)
    return None


def _clean_title(text: str) -> str:
    title = _PREFIX_RE.sub("", text)
    title = _DUE_STRIP_RE.sub("", title)
    title = re.sub(r"\s{2,}", " ", title)
    title = re.sub(r"[.,!]+$", "", title).strip()
    if not title:
        title = text.strip()
    title = title[0].upper() + title[1:] if title else title
    if len(title) > 64:
        title = title[:61].rstrip() + "…"
    return title


def _default_description(due: str | None) -> str:
    if due:
        return f"Scheduled for {due}. Tap to add notes or edit anytime."
    return "Captured from your message. Tap to add notes or edit anytime."


def _parse_locally(text: str) -> NovaDraft:
    due = _detect_due(text)
    title = _clean_title(text)
    return NovaDraft(title=title, description=_default_description(due), source="local")
