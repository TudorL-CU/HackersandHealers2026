import asyncio
from typing import TypedDict
from langgraph.graph import StateGraph, END

from app.nodes.summarizer import summarize_patient
from app.nodes.change_detector import detect_changes
from app.nodes.risk_analyzer import analyze_risks
from app.nodes.action_recommender import recommend_actions


class CopilotState(TypedDict):
    patient_id: str
    patient_name: str
    timeline: str
    story: str
    changes: list[str]
    risks: list[str]
    actions: list[str]


async def summarize_node(state: CopilotState) -> dict:
    story = await summarize_patient(state["timeline"])
    return {"story": story}


async def parallel_analysis_node(state: CopilotState) -> dict:
    changes, risks = await asyncio.gather(
        detect_changes(state["timeline"]),
        analyze_risks(state["timeline"]),
    )
    return {"changes": changes, "risks": risks}


async def actions_node(state: CopilotState) -> dict:
    actions = await recommend_actions(
        state["timeline"],
        state["changes"],
        state["risks"],
    )
    return {"actions": actions}


def build_graph():
    builder = StateGraph(CopilotState)

    builder.add_node("summarize", summarize_node)
    builder.add_node("analyze", parallel_analysis_node)
    builder.add_node("recommend", actions_node)

    builder.set_entry_point("summarize")
    builder.add_edge("summarize", "analyze")
    builder.add_edge("analyze", "recommend")
    builder.add_edge("recommend", END)

    return builder.compile()


copilot_graph = build_graph()
