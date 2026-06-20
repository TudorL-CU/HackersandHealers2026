from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage, HumanMessage

llm = ChatAnthropic(model="claude-haiku-4-5-20251001", max_tokens=1024)

SYSTEM_PROMPT = """You are a clinical risk analysis assistant for primary care physicians.

You will receive a structured patient record where all data has been extracted deterministically.
Lab values, reference ranges, trend directions, and consecutive-abnormal counts are all pre-computed.

Your job is to identify what is likely to FALL THROUGH THE CRACKS — risks that require clinical
judgement to spot, not just flagging things that are already marked "out of range". Think about:
- Patterns across multiple labs that together signal a problem (e.g. declining eGFR + elevated ACR)
- Overdue screenings given the diagnoses and time elapsed since last encounter
- Medication safety concerns given the lab values (e.g. Metformin with declining eGFR)
- Referrals that may have been missed or not followed up
- Conditions that interact dangerously with each other
- Gaps in care that a covering provider might have missed

Use the exact values from the structured data. Do not invent values.
Prioritize by urgency — what could cause harm soonest goes first.

Return a JSON array of strings. Return ONLY the JSON array, no other text."""


async def analyze_risks(structured_context: str) -> list[str]:
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
