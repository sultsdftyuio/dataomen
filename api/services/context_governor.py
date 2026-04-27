# api/services/context_governor.py

"""
Phase 4.1 — Deterministic Context Truncation & Sliding Window

Prevents LLM hallucination and massive billing spikes caused by uncapped
conversation history.  Implements a strict token budget using tiktoken,
keeping the system prompt (database schema context) pinned at the top and
applying a sliding window over conversation history.

Phase 4.2 — Asynchronous State Compression

When a session exceeds a configurable turn threshold (default 15), the
governor triggers a Celery background task that uses a cheaper/faster model
to compress the oldest messages into a dense bulleted summary, reducing
per-call payload by up to 80% while retaining mathematical context.
"""

import logging
import os
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Lazy-load tiktoken to avoid import overhead at module level
# ---------------------------------------------------------------------------
_encoder = None


def _get_encoder():
    """Lazy-initialize the cl100k_base encoder (used by GPT-4/5 family)."""
    global _encoder
    if _encoder is None:
        try:
            import tiktoken
            _encoder = tiktoken.get_encoding("cl100k_base")
        except ImportError:
            logger.error(
                "tiktoken is not installed. Context truncation will fall back "
                "to character-based estimation. Run: pip install tiktoken"
            )
    return _encoder


def count_tokens(text: str) -> int:
    """Count the number of tokens in a string using tiktoken."""
    enc = _get_encoder()
    if enc is None:
        # Fallback: ~4 characters per token is a rough GPT-family estimate
        return len(text) // 4
    return len(enc.encode(text, disallowed_special=()))


def count_message_tokens(message: Dict[str, Any]) -> int:
    """Count tokens for a single chat message (role + content + overhead)."""
    # Every message has ~4 tokens of overhead: <|im_start|>{role}\n...\n<|im_end|>
    content = str(message.get("content", ""))
    role = str(message.get("role", "user"))
    return count_tokens(content) + count_tokens(role) + 4


# ---------------------------------------------------------------------------
# Default Budget Configuration
# ---------------------------------------------------------------------------

# Total context window reserved for conversation history.
# System prompt and new user message consume separate budgets.
DEFAULT_HISTORY_TOKEN_BUDGET = int(
    os.getenv("CONTEXT_HISTORY_TOKEN_BUDGET", "4000")
)

# Max tokens reserved for the system prompt (schema context, persona, etc.)
DEFAULT_SYSTEM_PROMPT_TOKEN_BUDGET = int(
    os.getenv("CONTEXT_SYSTEM_PROMPT_TOKEN_BUDGET", "2000")
)

# Turn threshold that triggers async compression
COMPRESSION_TURN_THRESHOLD = int(
    os.getenv("CONTEXT_COMPRESSION_TURN_THRESHOLD", "15")
)

# Number of oldest messages to compress when triggered
COMPRESSION_MESSAGE_COUNT = int(
    os.getenv("CONTEXT_COMPRESSION_MESSAGE_COUNT", "10")
)


# ---------------------------------------------------------------------------
# Core Truncation Logic
# ---------------------------------------------------------------------------

class ContextGovernor:
    """
    Deterministic Context Truncation Engine.

    Ensures that the total token count of the conversation history sent to
    the LLM never exceeds the configured budget.  The algorithm:

      1. Pin the system prompt (schema context) at the top.
      2. If history contains a compressed summary block (from Phase 4.2),
         include it as a system-level message.
      3. Walk the history from newest → oldest, accumulating tokens.
      4. Stop when the budget is exhausted — older messages are dropped.
      5. If the session exceeds the turn threshold and no compression has
         occurred yet, trigger asynchronous compression.
    """

    def __init__(
        self,
        history_token_budget: int = DEFAULT_HISTORY_TOKEN_BUDGET,
        system_prompt_budget: int = DEFAULT_SYSTEM_PROMPT_TOKEN_BUDGET,
    ):
        self.history_token_budget = history_token_budget
        self.system_prompt_budget = system_prompt_budget

    def truncate_system_prompt(self, system_prompt: str) -> str:
        """
        Truncate the system prompt if it exceeds the budget.
        Preserves the opening (most critical schema info) and appends
        a truncation marker.
        """
        current_tokens = count_tokens(system_prompt)
        if current_tokens <= self.system_prompt_budget:
            return system_prompt

        enc = _get_encoder()
        if enc is None:
            # Character-based fallback: ~4 chars per token
            max_chars = self.system_prompt_budget * 4
            return system_prompt[:max_chars] + "\n\n[System prompt truncated for token budget]"

        tokens = enc.encode(system_prompt, disallowed_special=())
        truncated_tokens = tokens[: self.system_prompt_budget - 20]  # Reserve space for marker
        truncated = enc.decode(truncated_tokens)
        return truncated + "\n\n[System prompt truncated for token budget]"

    def truncate_history(
        self,
        history: List[Dict[str, str]],
        compressed_summary: Optional[str] = None,
    ) -> List[Dict[str, str]]:
        """
        Apply sliding window truncation to conversation history.

        Args:
            history: List of message dicts with 'role' and 'content'.
            compressed_summary: If present, a pre-computed summary of older
                messages that gets injected as a system message at the top.

        Returns:
            Truncated history list that fits within the token budget.
        """
        if not history:
            return []

        remaining_budget = self.history_token_budget

        # If we have a compressed summary, include it first (it's a dense
        # representation of older context that should always be present)
        prefix_messages: List[Dict[str, str]] = []
        if compressed_summary:
            summary_message = {
                "role": "system",
                "content": f"[Previous conversation summary]\n{compressed_summary}",
            }
            summary_tokens = count_message_tokens(summary_message)
            remaining_budget -= summary_tokens
            prefix_messages.append(summary_message)

        # Walk from newest → oldest, accumulating tokens until budget exhausted
        selected_reverse: List[Dict[str, str]] = []
        for message in reversed(history):
            msg_tokens = count_message_tokens(message)
            if remaining_budget - msg_tokens < 0:
                break
            remaining_budget -= msg_tokens
            selected_reverse.append(message)

        # Restore chronological order
        selected_reverse.reverse()

        return prefix_messages + selected_reverse

    def should_trigger_compression(
        self,
        total_turn_count: int,
        has_existing_summary: bool,
    ) -> bool:
        """
        Determine if the session should trigger async history compression.

        Triggers when:
          - Total turns exceed the threshold (default 15)
          - No existing summary exists yet (avoid re-compressing)
        """
        return (
            total_turn_count >= COMPRESSION_TURN_THRESHOLD
            and not has_existing_summary
        )

    def prepare_llm_context(
        self,
        system_prompt: str,
        history: List[Dict[str, str]],
        current_prompt: str,
        compressed_summary: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        One-shot method that prepares a complete, budget-safe LLM context.

        Returns:
            {
                "system_prompt": str,
                "history": List[Dict],
                "total_tokens": int,
                "messages_included": int,
                "messages_dropped": int,
                "compression_recommended": bool,
            }
        """
        # 1. Truncate system prompt
        safe_system = self.truncate_system_prompt(system_prompt)

        # 2. Apply sliding window to history
        safe_history = self.truncate_history(
            history,
            compressed_summary=compressed_summary,
        )

        # 3. Calculate final token usage
        system_tokens = count_tokens(safe_system)
        history_tokens = sum(count_message_tokens(m) for m in safe_history)
        prompt_tokens = count_tokens(current_prompt) + 4  # +4 for message overhead
        total_tokens = system_tokens + history_tokens + prompt_tokens

        original_count = len(history) + (1 if compressed_summary else 0)
        included_count = len(safe_history)
        dropped_count = original_count - included_count

        return {
            "system_prompt": safe_system,
            "history": safe_history,
            "total_tokens": total_tokens,
            "messages_included": included_count,
            "messages_dropped": dropped_count,
            "compression_recommended": self.should_trigger_compression(
                total_turn_count=len(history),
                has_existing_summary=compressed_summary is not None,
            ),
        }


# ---------------------------------------------------------------------------
# Compression Prompt Template (used by compute_worker.py)
# ---------------------------------------------------------------------------

COMPRESSION_SYSTEM_PROMPT = """You are a context compression specialist.
You will receive a block of conversation messages between a user and an AI data analyst.

Your task is to compress these messages into a dense, bulleted summary that preserves:
- Key questions the user asked
- Important data findings, numbers, and metrics mentioned
- SQL queries or analytical conclusions reached
- Any decisions or preferences the user expressed

Rules:
- Use bullet points, not prose
- Preserve exact numbers, metric names, and column names
- Do NOT add information that wasn't in the original messages
- Keep the summary under 500 tokens
- Format: Start with "## Context Summary" header"""


def build_compression_prompt(messages: List[Dict[str, str]]) -> str:
    """
    Build the user prompt for the compression LLM call.

    Takes the oldest N messages and formats them for summarization.
    """
    lines = []
    for msg in messages:
        role = msg.get("role", "unknown").upper()
        content = str(msg.get("content", ""))
        # Truncate individual messages to prevent the compression prompt
        # itself from exceeding token limits
        if len(content) > 2000:
            content = content[:2000] + "... [truncated]"
        lines.append(f"[{role}]: {content}")

    return "Compress the following conversation:\n\n" + "\n\n".join(lines)


# ---------------------------------------------------------------------------
# Global singleton
# ---------------------------------------------------------------------------

context_governor = ContextGovernor()
