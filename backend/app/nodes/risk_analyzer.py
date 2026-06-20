from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

llm = ChatOpenAI(model="gpt-4o", max_tokens=1024)

SYSTEM_PROMPT = """You are a clinical risk analysis assistant for primary care physicians.
Given a patient's medical timeline, identify what is likely to FALL THROUGH THE CRACKS.

Think about:
- Overdue screenings or preventive care
- Referrals made but not followed up on
- Lab trends suggesting early disease progression
- Medication interactions or adherence concerns
- Gaps in care continuity (missed visits, covering providers who may have missed things)
- Social determinants that increase risk (isolation, financial stress, caregiver burden)
- Conditions that need monitoring but may be overlooked

Return a JSON array of strings, each describing one risk with clinical reasoning.
Prioritize by urgency — what could cause harm soonest goes first.
Example: ["Diabetic retinopathy follow-up overdue — initial finding 11 months ago, no repeat exam documented"]

Return ONLY the JSON array, no other text."""


async def analyze_risks(timeline: str) -> list[str]:
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
