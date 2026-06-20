import time
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from app.models import CopilotRequest, CopilotResponse, PatientSummary, PageAnalysisRequest
from app.fhir_client import get_full_patient_record, format_patient_timeline, search_patients, get_patient
from app.graph import copilot_graph

app = FastAPI(
    title="Continuity Copilot",
    description="Longitudinal patient summary for primary care clinicians",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _format_patient_entry(p: dict) -> dict:
    patient_name = "Unknown"
    if p.get("name"):
        n = p["name"][0]
        given = " ".join(n.get("given", []))
        family = n.get("family", "")
        patient_name = f"{given} {family}".strip()
    return {
        "id": p["id"],
        "name": patient_name,
        "birthDate": p.get("birthDate", "Unknown"),
        "gender": p.get("gender", "Unknown"),
    }


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

    timeline = format_patient_timeline(record)

    p = record["patient"]
    patient_name = "Unknown"
    if p.get("name"):
        n = p["name"][0]
        given = " ".join(n.get("given", []))
        family = n.get("family", "")
        patient_name = f"{given} {family}".strip()

    initial_state = {
        "patient_id": request.patient_id,
        "patient_name": patient_name,
        "timeline": timeline,
        "story": "",
        "changes": [],
        "risks": [],
        "actions": [],
    }

    result = await copilot_graph.ainvoke(initial_state)

    elapsed = time.time() - start

    return CopilotResponse(
        summary=PatientSummary(
            patient_id=request.patient_id,
            patient_name=patient_name,
            story=result["story"],
            changes=result["changes"],
            risks=result["risks"],
            actions=result["actions"],
        ),
        sources=[f"FHIR Server: Patient/{request.patient_id}"],
        processing_time_seconds=round(elapsed, 2),
    )


@app.post("/api/analyze-page", response_model=CopilotResponse)
async def analyze_page(request: PageAnalysisRequest):
    start = time.time()

    if not request.page_text.strip():
        raise HTTPException(status_code=400, detail="No text content found on page")

    timeline = f"DOCUMENT SOURCE: {request.page_title or 'Unknown'}\n"
    timeline += f"URL: {request.page_url or 'Unknown'}\n\n"
    timeline += request.page_text[:15000]

    initial_state = {
        "patient_id": "page-analysis",
        "patient_name": request.page_title or "Patient from EMR",
        "timeline": timeline,
        "story": "",
        "changes": [],
        "risks": [],
        "actions": [],
    }

    result = await copilot_graph.ainvoke(initial_state)

    elapsed = time.time() - start

    return CopilotResponse(
        summary=PatientSummary(
            patient_id="page-analysis",
            patient_name=result.get("patient_name", "Patient from EMR"),
            story=result["story"],
            changes=result["changes"],
            risks=result["risks"],
            actions=result["actions"],
        ),
        sources=[request.page_url or "Current browser tab"],
        processing_time_seconds=round(elapsed, 2),
    )


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "continuity-copilot"}
