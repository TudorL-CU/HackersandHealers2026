from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage, HumanMessage

llm = ChatAnthropic(model="claude-haiku-4-5-20251001", max_tokens=1024)

SYSTEM_PROMPT = """You are a clinical change detection assistant for primary care.

Identify clinically significant changes from the structured patient record.

Rules — strictly enforced:
- ONE sentence per change, max 12 words.
- Include the key values (e.g. "7.1% → 7.8%", "added Jan 2025").
- Start with the thing that changed: the lab, med, or condition name.
- No filler words ("Note that", "It appears", "There has been").

Bad: "HbA1c has shown a worsening trend rising from 7.1% in April to 7.8% in October 2025."
Good: "HbA1c worsening: 7.1% → 7.8% (Apr–Oct 2025)."

Return a JSON array of strings, prioritised by clinical significance.
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
