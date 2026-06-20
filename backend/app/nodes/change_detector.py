from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage, HumanMessage

llm = ChatAnthropic(model="claude-haiku-4-5-20251001", max_tokens=1024)

SYSTEM_PROMPT = """You are a clinical change detection assistant for primary care.

You will receive a structured patient record where lab values, conditions, medications, and
encounter dates have already been extracted deterministically. The trend direction and delta
values are pre-computed for you.

Your job is to identify which changes are CLINICALLY SIGNIFICANT and explain why — not to
re-read or re-extract the values. Focus on:
- Lab trends that indicate disease progression or improvement (use the pre-computed deltas)
- New or changed medications and their clinical context
- New diagnoses or worsening conditions
- Vital sign trajectories that matter clinically

Be specific: reference the exact values that were extracted (e.g. "HbA1c rose from 7.1% to 7.8%").
Do not invent values that are not in the structured data.

Return a JSON array of strings, each one change. Prioritize by clinical significance.
Return ONLY the JSON array, no other text."""


async def detect_changes(structured_context: str) -> list[str]:
    response = await llm.ainvoke([
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=f"Patient record (pre-extracted):\n\n{structured_context}"),
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
