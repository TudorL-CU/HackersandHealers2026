import asyncio
from typing import TypedDict
from langgraph.graph import StateGraph, END

from app.nodes.summarizer import summarize_patient
from app.nodes.change_detector import detect_changes
from app.nodes.risk_analyzer import analyze_risks
from app.nodes.action_recommender import recommend_actions
from app.nodes.care_advisor import advise_care


class CopilotState(TypedDict):
    patient_id: str
    patient_name: str
    timeline: str
    story: str
    changes: list[str]
    risks: list[dict]
    actions: list[str]
    questions: list[str]
    alerts: list[dict]


async def all_parallel_node(state: CopilotState) -> dict:
    story, changes, risks, care = await asyncio.gather(
        summarize_patient(state["timeline"]),
        detect_changes(state["timeline"]),
        analyze_risks(state["timeline"]),
        advise_care(state["timeline"]),
    )
    return {
        "story": story,
        "changes": changes,
        "risks": risks,
        "questions": care["questions"],
        "alerts": care["alerts"],
    }


async def actions_node(state: CopilotState) -> dict:
    actions = await recommend_actions(
        state["timeline"],
        state["changes"],
        state["risks"],
    )
    return {"actions": actions}


def build_graph():
    builder = StateGraph(CopilotState)

    builder.add_node("analyze", all_parallel_node)
    builder.add_node("recommend", actions_node)

    builder.set_entry_point("analyze")
    builder.add_edge("analyze", "recommend")
    builder.add_edge("recommend", END)

    return builder.compile()


copilot_graph = build_graph()
