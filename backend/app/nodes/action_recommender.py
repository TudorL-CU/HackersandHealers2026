from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage, HumanMessage

llm = ChatAnthropic(model="claude-sonnet-4-6", max_tokens=1024)

SYSTEM_PROMPT = """You are a clinical action planning assistant for primary care physicians.

You will receive a structured patient record (pre-extracted data) along with clinically significant
changes and identified risks. All values have been extracted deterministically — your job is to
recommend concrete next steps, not to re-read or re-derive the data.

Each action should be:
- Specific and actionable — reference the exact finding that drives the action
- Something the CLINICIAN can do NOW or schedule in the near term
- Framed from the clinician's perspective (not the patient's)
- Tied directly to a value or risk from the structured data

Think about: orders to place, referrals to make, dose adjustments, follow-up scheduling,
medication safety checks, overdue screenings, conversations to have.

Prioritize by clinical urgency. Use the exact values from the structured context.

Return a JSON array of strings. Return ONLY the JSON array, no other text."""


async def recommend_actions(
    structured_context: str,
    changes: list[str],
    risks: list[str],
) -> list[str]:
    human_content = f"""Patient record (pre-extracted):
{structured_context}

Clinically significant changes identified:
{chr(10).join(f'- {c}' for c in changes)}

Risks identified:
{chr(10).join(f'- {r}' for r in risks)}"""

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
