"""
Pickup Brain — LLM Brief Writer
================================
Calls the Anthropic API to produce a 3-sentence cognitive re-entry brief
from a :class:`~models.ContextPacket`.

Brief Generation Flow
---------------------
1. Serialise the ContextPacket to JSON (``json.dumps``).
2. POST to ``claude-haiku-4-5-20251001`` with the canonical system prompt.
3. Count sentences in the response.
4. If sentence count ≠ 3, retry **once** at ``ANTHROPIC_RETRY_TEMPERATURE``.
5. If still ≠ 3 after retry, store the brief and flag it
   ``brief_invalid = True``.

The function never raises; all errors are caught, logged, and surfaced
in the return dict so callers can decide how to handle degraded output.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import asdict
from typing import TypedDict

import anthropic

from config import (
    ANTHROPIC_MAX_TOKENS,
    ANTHROPIC_MODEL,
    ANTHROPIC_RETRY_TEMPERATURE,
    ANTHROPIC_TEMPERATURE,
)
from models import ContextPacket

logger = logging.getLogger(__name__)

# ── System Prompt ──────────────────────────────────────────────────────────────
# Do NOT modify this prompt without updating the spec and bumping PICKUP_MODEL.

SYSTEM_PROMPT: str = """\
You are a cognitive state recorder. Your job is to write a re-entry \
brief so the reader can reconstruct their exact mental state.

Rules — follow every one or your output is invalid:
- Write exactly 3 sentences. No more. No less.
- Sentence 1: What was actively being worked on. Be specific. \
Use file names, function names, branch names if present.
- Sentence 2: The open problem or unresolved decision. \
The thing that had not been solved yet when the session ended.
- Sentence 3: The next concrete action that was about to happen.
- Use second person: "You were...", "You had not yet...", \
"Your next step was..."
- Total word count must not exceed 60 words.
- If context comes from an AI agent, begin sentence 1 with "[Agent]"
- If any sentence is inferred rather than observed, end it with (↑)
- Never be vague. Never summarize. Reconstruct.\
"""


# ── Return type ────────────────────────────────────────────────────────────────

class BriefResult(TypedDict):
    brief: str
    tokens_used: int
    brief_invalid: bool


# ── Sentence validation ────────────────────────────────────────────────────────

# Matches a terminal punctuation character followed by whitespace or end-of-string.
_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")


def _count_sentences(text: str) -> int:
    """
    Count sentences in *text* by splitting on terminal punctuation.

    A sentence is any non-empty token after splitting on ``[.!?]\\s+``.
    This is intentionally simple — complex NLP is overkill here since the
    model is explicitly instructed to write exactly 3.
    """
    parts = _SENTENCE_SPLIT_RE.split(text.strip())
    return sum(1 for p in parts if p.strip())


# ── API calls ──────────────────────────────────────────────────────────────────

def _call_api(
    client: anthropic.Anthropic,
    context_json: str,
    temperature: float,
) -> tuple[str, int]:
    """
    Make a single Messages API call.

    Parameters
    ----------
    client:
        Authenticated Anthropic client (reads ``ANTHROPIC_API_KEY`` from env).
    context_json:
        JSON-serialised :class:`~models.ContextPacket` to send as the user turn.
    temperature:
        Sampling temperature (0.0 for deterministic, 0.2 for retry).

    Returns
    -------
    (brief_text, total_tokens_used)
    """
    message = client.messages.create(
        model=ANTHROPIC_MODEL,
        max_tokens=ANTHROPIC_MAX_TOKENS,
        temperature=temperature,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": context_json}],
    )

    brief: str = message.content[0].text.strip()  # type: ignore[index]
    tokens: int = message.usage.input_tokens + message.usage.output_tokens
    return brief, tokens


# ── Public API ─────────────────────────────────────────────────────────────────

def generate_brief(context: ContextPacket) -> BriefResult:
    """
    Generate a 3-sentence re-entry brief from a :class:`~models.ContextPacket`.

    Parameters
    ----------
    context:
        Harvested context snapshot for the session.

    Returns
    -------
    :class:`BriefResult` dict with keys:
    - ``brief``        — the generated (or best-effort) text
    - ``tokens_used``  — total tokens consumed (input + output, all retries)
    - ``brief_invalid``— ``True`` if validation failed after one retry
    """
    client = anthropic.Anthropic()  # ANTHROPIC_API_KEY read from env
    context_json = json.dumps(asdict(context), default=str)
    total_tokens = 0

    # ── First attempt ────────────────────────────────────────────────────────
    try:
        brief, tokens = _call_api(client, context_json, ANTHROPIC_TEMPERATURE)
        total_tokens += tokens
    except anthropic.APIError as exc:
        logger.error("Anthropic API error on first attempt: %s", exc, exc_info=True)
        return BriefResult(brief="[Pickup: API error — could not generate brief]",
                           tokens_used=0, brief_invalid=True)

    sentence_count = _count_sentences(brief)
    logger.info("Brief generated", extra={"sentences": sentence_count, "tokens": tokens})

    if sentence_count == 3:
        return BriefResult(brief=brief, tokens_used=total_tokens, brief_invalid=False)

    # ── Retry ────────────────────────────────────────────────────────────────
    logger.warning(
        "Brief sentence count %d ≠ 3 — retrying at temperature %.1f",
        sentence_count,
        ANTHROPIC_RETRY_TEMPERATURE,
        extra={"original_brief": brief},
    )

    try:
        brief, tokens = _call_api(client, context_json, ANTHROPIC_RETRY_TEMPERATURE)
        total_tokens += tokens
    except anthropic.APIError as exc:
        logger.error("Anthropic API error on retry: %s", exc, exc_info=True)
        return BriefResult(brief=brief, tokens_used=total_tokens, brief_invalid=True)

    sentence_count = _count_sentences(brief)

    if sentence_count != 3:
        logger.error(
            "Brief still has %d sentences after retry — flagging invalid",
            sentence_count,
            extra={"brief": brief},
        )
        return BriefResult(brief=brief, tokens_used=total_tokens, brief_invalid=True)

    return BriefResult(brief=brief, tokens_used=total_tokens, brief_invalid=False)
