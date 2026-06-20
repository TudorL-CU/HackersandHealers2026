import re
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

# ── Lab name normalisation map ─────────────────────────────────────────────
_LAB_ALIASES: list[tuple[str, str]] = [
    ("hba1c", "HbA1c"),
    ("hemoglobin a1c", "HbA1c"),
    ("glycosylated", "HbA1c"),
    ("systolic blood pressure", "Systolic BP"),
    ("systolic", "Systolic BP"),
    ("diastolic blood pressure", "Diastolic BP"),
    ("diastolic", "Diastolic BP"),
    ("body weight", "Weight (kg)"),
    ("body mass index", "BMI"),
    ("bmi", "BMI"),
    ("glomerular filtration rate", "eGFR"),
    ("egfr", "eGFR"),
    ("creatinine [mass", "Creatinine"),
    ("creatinine", "Creatinine"),
    ("cholesterol in hdl", "HDL"),
    ("hdl", "HDL"),
    ("cholesterol in ldl", "LDL"),
    ("ldl", "LDL"),
    ("cholesterol [mass", "Total Cholesterol"),
    ("total cholesterol", "Total Cholesterol"),
    ("cholesterol", "Total Cholesterol"),
    ("triglyceride", "Triglycerides"),
    ("glucose", "Glucose"),
    ("thyrotropin", "TSH"),
    ("tsh", "TSH"),
    ("potassium", "Potassium"),
    ("albumin/creatinine", "Urine ACR"),
    ("albumin-to-creatinine", "Urine ACR"),
    ("microalbumin", "Urine ACR"),
]

# Reference ranges for visual context in charts { label: (low, high) }
LAB_REFERENCE_RANGES: dict[str, tuple[float, float]] = {
    "HbA1c": (4.0, 7.0),
    "Systolic BP": (90.0, 130.0),
    "Diastolic BP": (60.0, 80.0),
    "eGFR": (60.0, 120.0),
    "Total Cholesterol": (0.0, 5.2),
    "LDL": (0.0, 2.6),
    "HDL": (1.0, 999.0),
    "Glucose": (3.9, 6.1),
    "TSH": (0.4, 4.0),
    "Potassium": (3.5, 5.0),
    "Creatinine": (45.0, 100.0),
    "Urine ACR": (0.0, 3.0),
    "Weight (kg)": (0.0, 999.0),
    "BMI": (18.5, 25.0),
    "Triglycerides": (0.0, 1.7),
}


def _normalise_lab_name(code_text: str) -> "str | None":
    lower = code_text.lower()
    for key, label in _LAB_ALIASES:
        if key in lower:
            return label
    return None


def extract_lab_trends(observations: list[dict]) -> dict[str, list[dict]]:
    """Group numeric FHIR observations by normalised lab name, sorted by date."""
    raw: dict[str, list[dict]] = {}

    for obs in observations:
        vq = obs.get("valueQuantity")
        if not vq or vq.get("value") is None:
            continue

        code_text = obs.get("code", {}).get("text", "")
        if not code_text:
            codings = obs.get("code", {}).get("coding", [])
            code_text = codings[0].get("display", "") if codings else ""
        if not code_text:
            continue

        label = _normalise_lab_name(code_text)
        if not label:
            continue

        date = obs.get("effectiveDateTime", obs.get("issued", ""))
        if not date:
            continue

        raw.setdefault(label, []).append({
            "date": date[:10],
            "value": round(float(vq["value"]), 2),
            "unit": vq.get("unit", ""),
        })

    result: dict[str, list[dict]] = {}
    for label, points in raw.items():
        seen: set[str] = set()
        deduped = []
        for p in sorted(points, key=lambda x: x["date"]):
            if p["date"] not in seen:
                seen.add(p["date"])
                deduped.append(p)

        # Attach reference range if known
        ref = LAB_REFERENCE_RANGES.get(label)
        if ref:
            for p in deduped:
                p["refLow"] = ref[0]
                p["refHigh"] = ref[1]

        result[label] = deduped

    return result


def extract_conditions_timeline(conditions: list[dict]) -> list[dict]:
    """Return conditions with onset dates, sorted oldest first."""
    timeline = []
    for c in conditions:
        code_text = c.get("code", {}).get("text", "")
        if not code_text:
            codings = c.get("code", {}).get("coding", [])
            code_text = codings[0].get("display", "Unknown") if codings else "Unknown"

        onset = c.get("onsetDateTime", c.get("onsetPeriod", {}).get("start", ""))
        if not onset:
            continue

        status = (c.get("clinicalStatus", {}).get("coding") or [{}])[0].get("code", "active")
        timeline.append({"name": code_text, "onset": onset[:10], "status": status})

    return sorted(timeline, key=lambda x: x["onset"])


def parse_labs_from_page_text(text: str) -> dict[str, list[dict]]:
    """
    Heuristic extraction of lab values from plain-text EMR pages.
    Looks for patterns like: "HbA1c  7.5%  <7.0%  HIGH"
    grouped by encounter date headers.
    """
    # Find encounter dates (e.g. "2025-10-12 — Office Visit")
    date_pattern = re.compile(r"(\d{4}-\d{2}-\d{2})\s*[—\-–]")
    # Lab value patterns: name followed by a numeric value with optional unit
    lab_pattern = re.compile(
        r"(HbA1c|Fasting Glucose|Total Cholesterol|LDL|HDL|eGFR|Creatinine|"
        r"Urine ACR|Blood Pressure|Weight|BMI|Triglycerides|TSH|Potassium)"
        r"[:\s]+(\d+\.?\d*)\s*(%|mg/dL|mg/g|mL/min|mmol/L|kg|kg/m²|mIU/L|bpm|mmHg)?",
        re.IGNORECASE,
    )

    NAME_MAP = {
        "hba1c": "HbA1c",
        "fasting glucose": "Glucose",
        "glucose": "Glucose",
        "total cholesterol": "Total Cholesterol",
        "ldl": "LDL",
        "hdl": "HDL",
        "egfr": "eGFR",
        "creatinine": "Creatinine",
        "urine acr": "Urine ACR",
        "weight": "Weight (kg)",
        "bmi": "BMI",
        "triglycerides": "Triglycerides",
        "tsh": "TSH",
        "potassium": "Potassium",
        "blood pressure": "Systolic BP",
    }

    # Split text into date-labelled chunks; fall back to whole-text with today
    chunks: list[tuple[str, str]] = []
    parts = date_pattern.split(text)
    i = 0
    while i < len(parts):
        if re.match(r"\d{4}-\d{2}-\d{2}", parts[i]):
            chunks.append((parts[i], parts[i + 1] if i + 1 < len(parts) else ""))
            i += 2
        else:
            i += 1
    if not chunks:
        chunks = [(time.strftime("%Y-%m-%d"), text)]

    raw: dict[str, list[dict]] = {}
    for date_str, chunk in chunks:
        for m in lab_pattern.finditer(chunk):
            raw_name = m.group(1).lower().strip()
            label = NAME_MAP.get(raw_name)
            if not label:
                continue
            try:
                value = round(float(m.group(2)), 2)
            except ValueError:
                continue
            unit = m.group(3) or ""
            point: dict = {"date": date_str, "value": value, "unit": unit}
            ref = LAB_REFERENCE_RANGES.get(label)
            if ref:
                point["refLow"] = ref[0]
                point["refHigh"] = ref[1]
            raw.setdefault(label, []).append(point)

    result: dict[str, list[dict]] = {}
    for label, points in raw.items():
        seen: set[str] = set()
        deduped = []
        for p in sorted(points, key=lambda x: x["date"]):
            if p["date"] not in seen:
                seen.add(p["date"])
                deduped.append(p)
        if deduped:
            result[label] = deduped

    return result


def parse_conditions_from_page_text(text: str) -> list[dict]:
    """Extract conditions from OSCAR EMR page text in the format 'Name (ICD) — YYYY'."""
    pattern = re.compile(
        r"([A-Z][^(\n]{2,60}?)\s*\([A-Z0-9][A-Z0-9\.\-]+\)\s*[—\-–]\s*(\d{4})",
        re.MULTILINE,
    )
    seen: set[str] = set()
    conditions = []
    for m in pattern.finditer(text):
        name = m.group(1).strip().rstrip(",. ")
        year = m.group(2)
        if name in seen or len(name) < 3:
            continue
        seen.add(name)
        conditions.append({"name": name, "onset": f"{year}-01-01", "status": "active"})
    return sorted(conditions, key=lambda x: x["onset"])


# ── Helpers ────────────────────────────────────────────────────────────────
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


# ── Routes ─────────────────────────────────────────────────────────────────
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

    lab_trends = extract_lab_trends(record.get("observations", []))
    conditions_timeline = extract_conditions_timeline(record.get("conditions", []))
    med_count = len([m for m in record.get("medications", []) if m.get("status") == "active"])

    elapsed = time.time() - start

    return CopilotResponse(
        summary=PatientSummary(
            patient_id=request.patient_id,
            patient_name=patient_name,
            story=result["story"],
            changes=result["changes"],
            risks=result["risks"],
            actions=result["actions"],
            lab_trends=lab_trends,
            conditions_timeline=conditions_timeline,
            medication_count=med_count,
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

    lab_trends = parse_labs_from_page_text(request.page_text)
    conditions_timeline = parse_conditions_from_page_text(request.page_text)

    elapsed = time.time() - start

    return CopilotResponse(
        summary=PatientSummary(
            patient_id="page-analysis",
            patient_name=result.get("patient_name", request.page_title or "Patient from EMR"),
            story=result["story"],
            changes=result["changes"],
            risks=result["risks"],
            actions=result["actions"],
            lab_trends=lab_trends,
            conditions_timeline=conditions_timeline,
            medication_count=0,
        ),
        sources=[request.page_url or "Current browser tab"],
        processing_time_seconds=round(elapsed, 2),
    )


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "continuity-copilot"}
