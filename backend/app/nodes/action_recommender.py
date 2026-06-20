from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage, HumanMessage

llm = ChatAnthropic(model="claude-haiku-4-5-20251001", max_tokens=1024)

SYSTEM_PROMPT = """You are a clinical action planning assistant for primary care physicians.

Return a prioritised list of actions the clinician should take TODAY or schedule soon.

Rules — strictly enforced:
- ONE sentence per action, max 12 words. No sub-bullets, no explanations, no "consider".
- Start with a verb: Order / Uptitrate / Refer / Schedule / Review / Check / Stop.
- Include the key value or finding in the sentence (e.g. "HbA1c 7.5%", "eGFR 64").
- No padding, no rationale — just the action.

Bad: "Consider reviewing the antihypertensive regimen given the elevated blood pressure readings over the past several months and the worsening trend."
Good: "Uptitrate antihypertensive — BP 148/92 mmHg, 5 consecutive readings above target."

Return a JSON array of strings. Return ONLY the JSON array, no other text."""


async def recommend_actions(
    structured_context: str,
    changes: list[str],
    risks: list[dict],
) -> list[str]:
    # Extract issue + evidence text from structured risk objects
    risk_lines = []
    for r in risks:
        if isinstance(r, dict):
            line = f"[{r.get('confidence', 'MEDIUM')}] {r.get('issue', '')} — {r.get('evidence', '')}".strip(" —")
        else:
            line = str(r)
        risk_lines.append(f"- {line}")

    human_content = f"""Patient record (pre-extracted):
{structured_context}

Clinically significant changes identified:
{chr(10).join(f'- {c}' for c in changes)}

Risks identified (with confidence + evidence):
{chr(10).join(risk_lines)}"""

    response = await llm.ainvoke([
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=human_content),
    ])
    import json, re
    text = re.sub(r"```(?:json)?\s*", "", response.content).replace("```", "").strip()
    start = text.find("[")
    end = text.rfind("]") + 1
    if start != -1 and end > start:
        try:
            return json.loads(text[start:end])
        except json.JSONDecodeError:
            pass
    return [response.content]
