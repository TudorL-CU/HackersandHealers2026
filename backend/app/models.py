from pydantic import BaseModel
from typing import Optional


class PatientSummary(BaseModel):
    patient_id: str
    patient_name: str
    story: str
    changes: list[str]
    risks: list[str]
    actions: list[str]
    confidence: dict[str, str] = {}


class CopilotRequest(BaseModel):
    patient_id: str
    context: Optional[str] = None


class CopilotResponse(BaseModel):
    summary: PatientSummary
    sources: list[str] = []
    processing_time_seconds: float = 0.0
