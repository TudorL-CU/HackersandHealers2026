import time
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from app.models import CopilotRequest, CopilotResponse, PatientSummary, PageAnalysisRequest
from app.fhir_client import get_full_patient_record, search_patients, get_patient
from app.graph import copilot_graph
from app.extractor import (
    extract_from_fhir,
    extract_from_page_text,
    format_for_llm,
    to_lab_trends,
    to_conditions_timeline,
)

app = FastAPI(
    title="Continuity Copilot",
    description="Longitudinal patient summary for primary care clinicians",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _patient_name(p: dict) -> str:
    if p.get("name"):
        n = p["name"][0]
        given = " ".join(n.get("given", []))
        return f"{given} {n.get('family', '')}".strip()
    return "Unknown"


def _format_patient_entry(p: dict) -> dict:
    return {
        "id": p["id"],
        "name": _patient_name(p),
        "birthDate": p.get("birthDate", "Unknown"),
        "gender": p.get("gender", "Unknown"),
    }


# ── Routes ──────────────────────────────────────────────────────────────────

@app.get("/api/patients")
async def list_patients(name: str = "", id: str = "", count: int = 20):
    if id:
        try:
            p = await get_patient(id)
            return {"patients": [_format_patient_entry(p)]}
        except Exception:
            return {"patients": []}
    patients = await search_patients(name=name, count=count)
    return {"patients": [_format_patient_entry(p) for p in patients]}


@app.post("/api/copilot", response_model=CopilotResponse)
async def run_copilot(request: CopilotRequest):
    start = time.time()

    try:
        record = await get_full_patient_record(request.patient_id)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Could not fetch patient data: {e}")

    # ── Step 1: deterministic extraction (no LLM) ──────────────────────────
    patient_record = extract_from_fhir(record)
    structured_context = format_for_llm(patient_record)

    # ── Step 2: LLM reasoning on structured facts ──────────────────────────
    initial_state = {
        "patient_id": request.patient_id,
        "patient_name": patient_record.patient_name,
        "timeline": structured_context,
        "story": "",
        "changes": [],
        "risks": [],
        "actions": [],
        "questions": [],
        "alerts": [],
    }
    result = await copilot_graph.ainvoke(initial_state)

    # ── Step 3: convert extracted data to chart format ─────────────────────
    lab_trends = to_lab_trends(patient_record)
    conditions_timeline = to_conditions_timeline(patient_record)
    med_count = sum(1 for m in patient_record.medications if m.status == "active")

    elapsed = time.time() - start
    return CopilotResponse(
        summary=PatientSummary(
            patient_id=request.patient_id,
            patient_name=patient_record.patient_name,
            story=result["story"],
            changes=result["changes"],
            risks=result["risks"],
            actions=result["actions"],
            lab_trends=lab_trends,
            conditions_timeline=conditions_timeline,
            medication_count=med_count,
            visit_date=patient_record.visit_date,
            visit_reason=patient_record.visit_reason,
            questions=result.get("questions", []),
            alerts=result.get("alerts", []),
        ),
        sources=[f"FHIR Server: Patient/{request.patient_id}"],
        processing_time_seconds=round(elapsed, 2),
    )


@app.post("/api/analyze-page", response_model=CopilotResponse)
async def analyze_page(request: PageAnalysisRequest):
    start = time.time()

    if not request.page_text.strip():
        raise HTTPException(status_code=400, detail="No text content found on page")

    # ── Step 1: deterministic extraction from page text (no LLM) ──────────
    patient_record = extract_from_page_text(request.page_text, request.page_title or "")
    structured_context = format_for_llm(patient_record)

    # ── Step 2: LLM reasoning on structured facts ──────────────────────────
    initial_state = {
        "patient_id": "page-analysis",
        "patient_name": patient_record.patient_name or request.page_title or "Patient from EMR",
        "timeline": structured_context,
        "story": "",
        "changes": [],
        "risks": [],
        "actions": [],
        "questions": [],
        "alerts": [],
    }
    result = await copilot_graph.ainvoke(initial_state)

    # ── Step 3: convert extracted data to chart format ─────────────────────
    lab_trends = to_lab_trends(patient_record)
    conditions_timeline = to_conditions_timeline(patient_record)

    elapsed = time.time() - start
    return CopilotResponse(
        summary=PatientSummary(
            patient_id="page-analysis",
            patient_name=patient_record.patient_name or request.page_title or "Patient from EMR",
            story=result["story"],
            changes=result["changes"],
            risks=result["risks"],
            actions=result["actions"],
            lab_trends=lab_trends,
            conditions_timeline=conditions_timeline,
            medication_count=0,
            visit_date=patient_record.visit_date,
            visit_reason=patient_record.visit_reason,
            questions=result.get("questions", []),
            alerts=result.get("alerts", []),
        ),
        sources=[request.page_url or "Current browser tab"],
        processing_time_seconds=round(elapsed, 2),
    )


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "continuity-copilot"}
