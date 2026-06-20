from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage, HumanMessage

llm = ChatAnthropic(model="claude-haiku-4-5-20251001", max_tokens=1024)

SYSTEM_PROMPT = """You are a clinical summarization assistant for primary care physicians.

Write a 3-bullet patient snapshot a physician can read in 10 seconds.

Rules:
- Exactly 3 bullet points, each one sentence, max 15 words
- Bullet 1: Who is this patient (age/conditions/how long under care)
- Bullet 2: The single most important clinical concern right now
- Bullet 3: The biggest trajectory or gap risk

Format — return ONLY the 3 lines, each starting with "• ":
• ...
• ...
• ..."""


async def summarize_patient(structured_context: str) -> str:
    response = await llm.ainvoke([
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=f"Patient record (pre-extracted):\n\n{structured_context}"),
    ])
    return response.content
