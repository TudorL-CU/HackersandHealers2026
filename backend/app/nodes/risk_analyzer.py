from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage, HumanMessage

llm = ChatAnthropic(model="claude-haiku-4-5-20251001", max_tokens=2048)

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

For each risk, you must return a structured object with four fields:
- "issue": one clear sentence naming the risk (e.g. "Metformin unsafe with declining eGFR")
- "confidence": HIGH, MEDIUM, or LOW
  - HIGH = supported by specific documented values/dates in the record
  - MEDIUM = clinically reasonable inference from available data
  - LOW = possible concern but insufficient data to confirm
- "evidence": 1-2 sentences citing the specific extracted data points that support this risk.
  Reference exact values and dates. Do not cite data that is not in the record.
- "relevant_to_visit": true if this risk is directly relevant to the current visit's reason/assessment,
  false otherwise. If no visit context is provided, set to false.

Use the exact values from the structured data. Do not invent values.
Prioritize by urgency — what could cause harm soonest goes first.

Return a JSON array of objects. Return ONLY the JSON array, no other text.
Example format:
[
  {
    "issue": "Metformin safety risk with declining kidney function",
    "confidence": "HIGH",
    "evidence": "eGFR declined from 68 (2025-07-18) to 64 mL/min (2025-10-12). Urine ACR elevated at 45 mg/g. Metformin is contraindicated if eGFR falls below 30 and requires dose review below 45."
  }
]"""


async def analyze_risks(structured_context: str) -> list[dict]:
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
            parsed = json.loads(text[start:end])
            # Normalise: ensure every item is a dict with the right keys
            result = []
            for item in parsed:
                if isinstance(item, dict):
                    result.append({
                        "issue": item.get("issue", str(item)),
                        "confidence": item.get("confidence", "MEDIUM").upper(),
                        "evidence": item.get("evidence", ""),
                        "relevant_to_visit": bool(item.get("relevant_to_visit", False)),
                    })
                else:
                    result.append({"issue": str(item), "confidence": "MEDIUM", "evidence": ""})
            return result
        except json.JSONDecodeError:
            pass
    return [{"issue": response.content, "confidence": "MEDIUM", "evidence": ""}]
