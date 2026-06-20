from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage, HumanMessage

llm = ChatAnthropic(model="claude-haiku-4-5-20251001", max_tokens=1024)

SYSTEM_PROMPT = """You are a clinical action planning assistant for primary care physicians.
Given a patient's timeline, the detected changes, and identified risks, recommend
concrete next actions the clinician should take.

Each action should be:
- Specific and actionable (not vague advice)
- Tied to a specific finding or risk
- Something that can be done NOW or scheduled in the near term
- Framed as what the CLINICIAN should do, not what the patient should do

Think about: orders to place, referrals to make, follow-ups to schedule, medications
to adjust, screenings to order, conversations to have with the patient.

Return a JSON array of strings, each describing one recommended action.
Prioritize by clinical urgency.
Example: ["Order HbA1c — last drawn 5 months ago, was trending up"]

Return ONLY the JSON array, no other text."""


async def recommend_actions(timeline: str, changes: list[str], risks: list[str]) -> list[str]:
    context = f"""Patient timeline:

{timeline}

Recent changes detected:
{chr(10).join(f'- {c}' for c in changes)}

Identified risks:
{chr(10).join(f'- {r}' for r in risks)}"""

    response = await llm.ainvoke([
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=context),
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
