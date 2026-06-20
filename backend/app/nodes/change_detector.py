from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

llm = ChatOpenAI(model="gpt-4o", max_tokens=1024)

SYSTEM_PROMPT = """You are a clinical change detection assistant for primary care.
Given a patient's medical timeline, identify what has CHANGED since their previous visit.

Focus on:
- New diagnoses or worsening conditions
- Medication changes (new, stopped, dose adjustments)
- Significant lab value changes (trending worse or better)
- Vital sign trends (especially blood pressure, weight, BMI)
- Changes in mental health status
- New referrals or specialist findings
- Social/life changes that affect health

Return a JSON array of strings, each describing one change. Be specific with values.
Example: ["HbA1c rose from 7.1% to 7.8%", "New diagnosis: mild diabetic retinopathy"]

If there is only one encounter or no clear comparison, note what's most clinically
significant from the most recent visit. Return ONLY the JSON array, no other text."""


async def detect_changes(timeline: str) -> list[str]:
    response = await llm.ainvoke([
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=f"Patient timeline:\n\n{timeline}"),
    ])
    import json
    try:
        return json.loads(response.content)
    except json.JSONDecodeError:
        text = response.content
        start = text.find("[")
        end = text.rfind("]") + 1
        if start != -1 and end > start:
            return json.loads(text[start:end])
        return [response.content]
