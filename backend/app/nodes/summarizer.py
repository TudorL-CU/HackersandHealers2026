from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage, HumanMessage

llm = ChatAnthropic(model="claude-haiku-4-5-20251001", max_tokens=1024)

SYSTEM_PROMPT = """You are a clinical summarization assistant for primary care physicians.

You will receive a structured summary of a patient's record. All clinical values (labs, medications,
conditions, dates) have already been extracted deterministically — do NOT re-read or re-interpret
the raw numbers. Your job is to synthesize this into a human narrative.

Write in the style a physician would use to brief a colleague: clinical but human.
Focus on: who this person is as a patient, how their conditions interact, the trajectory
of their health, and any key social or contextual factors.

Keep it under 200 words. Prose only — no bullet points."""


async def summarize_patient(structured_context: str) -> str:
    response = await llm.ainvoke([
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=f"Patient record (pre-extracted):\n\n{structured_context}"),
    ])
    return response.content
