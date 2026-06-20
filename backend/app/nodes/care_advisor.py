from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage, HumanMessage
import json, re

llm = ChatAnthropic(model="claude-haiku-4-5-20251001", max_tokens=1024)

SYSTEM_PROMPT = """You are a clinical care advisor for primary care physicians.

Given a pre-extracted patient record, generate two things:

1. QUESTIONS (4-5): Specific questions to ask THIS patient at THIS visit.
   - Tied to their actual diagnoses, medications, and lab values — not generic
   - Use their specific data: "Are you taking your amlodipine every day?" not "Do you take your medications?"
   - Focus: adherence, symptom changes, lifestyle, follow-up from last visit

2. ALERTS (3-5): Care gaps — things overdue or missing based on standard of care for their conditions.
   - Each alert: what's missing + how long it's been (use exact dates from the record)
   - Examples by condition: diabetic eye exam (annual), nephropathy screening (annual), HbA1c (every 3 months if uncontrolled), BP log, colorectal/breast cancer screening
   - Urgency: HIGH = overdue by >6 months or patient safety risk, MEDIUM = due soon or approaching guideline threshold

Return ONLY valid JSON:
{
  "questions": ["...", "..."],
  "alerts": [
    {"message": "10 words max — what's overdue", "detail": "one sentence — why and how long", "urgency": "HIGH|MEDIUM"}
  ]
}"""


async def advise_care(structured_context: str) -> dict:
    response = await llm.ainvoke([
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=f"Patient record (pre-extracted):\n\n{structured_context}"),
    ])
    text = re.sub(r"```(?:json)?\s*", "", response.content).replace("```", "").strip()
    start = text.find("{")
    end = text.rfind("}") + 1
    if start != -1 and end > start:
        try:
            parsed = json.loads(text[start:end])
            return {
                "questions": [str(q) for q in parsed.get("questions", [])],
                "alerts": [
                    {
                        "message": a.get("message", ""),
                        "detail": a.get("detail", ""),
                        "urgency": a.get("urgency", "MEDIUM").upper(),
                    }
                    for a in parsed.get("alerts", [])
                    if isinstance(a, dict) and a.get("message")
                ],
            }
        except json.JSONDecodeError:
            pass
    return {"questions": [], "alerts": []}
