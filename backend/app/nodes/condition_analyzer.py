from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage, HumanMessage
import json, re

llm = ChatAnthropic(model="claude-haiku-4-5-20251001", max_tokens=2000)

SYSTEM_PROMPT = """You are a clinical condition analysis assistant. A busy doctor will glance at
your output for 10 seconds. Every field must be SHORT and scannable.

Rules:
- condition_summary: ONE sentence max. State trajectory + key number.
- current_status: under 15 words. Use a value. Example: "Uncontrolled — BP 148/92, trending up"
- findings: ONE short sentence per visit. Just the key fact.
- metrics: ONLY the numbers, no prose. Example: "BP 148/92, HR 80"
- gaps_in_care: ONE short sentence each.

Return a JSON object:
{
  "condition_summary": "one sentence trajectory with key value",
  "relevant_labs": ["lab names relevant to this condition"],
  "visit_progression": [
    {
      "date": "YYYY-MM-DD",
      "provider": "doctor name",
      "findings": "one sentence — the key fact from this visit",
      "metrics": "just the numbers",
      "status": "improving | stable | worsening | new_finding"
    }
  ],
  "current_status": "under 15 words with a value",
  "gaps_in_care": ["short sentence each"]
}

Only include visits where this condition was relevant. Return ONLY the JSON object."""


async def analyze_condition(structured_context: str, condition_name: str) -> dict:
    response = await llm.ainvoke([
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=f"CONDITION TO ANALYZE: {condition_name}\n\nPATIENT RECORD:\n{structured_context}"),
    ])

    text = re.sub(r"```(?:json)?\s*", "", response.content).replace("```", "").strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}") + 1
        if start != -1 and end > start:
            return json.loads(text[start:end])
        return {
            "condition_summary": response.content,
            "relevant_labs": [],
            "visit_progression": [],
            "current_status": "Unable to parse",
            "gaps_in_care": [],
        }
