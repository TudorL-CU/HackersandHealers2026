from pydantic import BaseModel
from typing import Optional


class PatientSummary(BaseModel):
    patient_id: str
    patient_name: str
    story: str
    changes: list[str]
    risks: list[dict]
    actions: list[str]
    confidence: dict[str, str] = {}
    # Structured data for charts
    lab_trends: dict[str, list[dict]] = {}
    conditions_timeline: list[dict] = []
    medication_count: int = 0
    visit_date: str = ""
    visit_reason: str = ""


class CopilotRequest(BaseModel):
    patient_id: str
    context: Optional[str] = None


class PageAnalysisRequest(BaseModel):
    page_text: str
    page_title: Optional[str] = None
    page_url: Optional[str] = None


class CopilotResponse(BaseModel):
    summary: PatientSummary
    sources: list[str] = []
    processing_time_seconds: float = 0.0
