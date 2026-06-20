from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage, HumanMessage

llm = ChatAnthropic(model="claude-haiku-4-5-20251001", max_tokens=1024)

SYSTEM_PROMPT = """You are a clinical summarization assistant for primary care physicians.
Given a patient's complete medical timeline, produce a concise longitudinal patient story.

Write in the style a physician would use to brief a colleague — clinical but human.
Focus on: who this person is, their major conditions, how those conditions interact,
key social factors affecting their care, and the overall trajectory of their health.

Keep it under 200 words. No bullet points — write in prose."""


async def summarize_patient(timeline: str) -> str:
    response = await llm.ainvoke([
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=f"Patient timeline:\n\n{timeline}"),
    ])
    return response.content
