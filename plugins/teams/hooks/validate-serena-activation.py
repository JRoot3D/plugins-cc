#!/usr/bin/env python3
"""
PreToolUse guardrail for the teams plugin.

Blocks any Agent spawn targeting a flow-* subagent whose prompt does not begin
with the canonical serena-activation line. This converts the teams:flow
activation contract from a prompt-only convention into a hard guarantee: the
subagent cannot start without the instruction in place.

Exit codes:
    0 — allow (not an Agent call, or not a flow-* subagent, or line present)
    2 — block (line missing); stderr is surfaced to Claude
"""
from __future__ import annotations

import json
import sys

CANONICAL_LINE = 'First action: invoke Skill(skill: "serena:activate").'
FLOW_AGENTS = frozenset(
    {
        "flow-planner",
        "flow-implementer",
        "flow-reviewer",
        "flow-checker",
    }
)


def first_non_empty_line(text: str) -> str:
    for raw in text.splitlines():
        line = raw.strip()
        if line:
            return line
    return ""


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return 0

    if payload.get("tool_name") != "Agent":
        return 0

    tool_input = payload.get("tool_input") or {}
    subagent_type = tool_input.get("subagent_type", "")
    if subagent_type not in FLOW_AGENTS:
        return 0

    prompt = tool_input.get("prompt") or ""
    first_line = first_non_empty_line(prompt)

    if first_line == CANONICAL_LINE:
        return 0

    shown = first_line if first_line else "(empty prompt)"
    if len(shown) > 160:
        shown = shown[:157] + "..."

    sys.stderr.write(
        "teams:flow guardrail — spawn blocked.\n"
        f"Subagent: {subagent_type}\n"
        "Every flow-* subagent spawn must begin with the canonical serena-activation line\n"
        "so symbolic navigation is guaranteed before any other tool call.\n\n"
        "Expected first line (verbatim):\n"
        f"  {CANONICAL_LINE}\n\n"
        "Got first line:\n"
        f"  {shown}\n\n"
        "Fix: re-issue the Agent tool call with the expected line prepended as the\n"
        "first line of the prompt (above mode/phase/feature context).\n"
    )
    return 2


if __name__ == "__main__":
    sys.exit(main())
