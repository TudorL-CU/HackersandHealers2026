"""
Deterministic data extraction layer — no LLM, no ambiguity.

All data extraction happens here before any LLM is invoked.
The LLM receives structured, pre-computed facts and is responsible only for
clinical interpretation, not for reading or extracting values from raw text.
"""

import re
from dataclasses import dataclass, field
from datetime import date
from typing import Optional


# ── Reference ranges (clinical targets) ────────────────────────────────────

LAB_REFS: dict[str, tuple[float, float]] = {
    "HbA1c":            (4.0, 7.0),
    "Systolic BP":       (90.0, 130.0),
    "Diastolic BP":      (60.0, 85.0),
    "eGFR":             (60.0, 999.0),
    "Total Cholesterol": (0.0, 200.0),
    "LDL":              (0.0, 100.0),
    "HDL":              (40.0, 999.0),
    "Glucose":          (70.0, 100.0),
    "Creatinine":       (0.6, 1.2),
    "Urine ACR":        (0.0, 30.0),
    "TSH":              (0.4, 4.0),
    "Potassium":        (3.5, 5.0),
    "Triglycerides":    (0.0, 150.0),
    "BMI":              (18.5, 24.9),
}

LAB_UNITS: dict[str, str] = {
    "HbA1c": "%", "Systolic BP": "mmHg", "Diastolic BP": "mmHg",
    "eGFR": "mL/min", "Total Cholesterol": "mg/dL", "LDL": "mg/dL",
    "HDL": "mg/dL", "Glucose": "mg/dL", "Creatinine": "mg/dL",
    "Urine ACR": "mg/g", "TSH": "mIU/L", "Potassium": "mEq/L",
    "Triglycerides": "mg/dL", "Weight (kg)": "kg", "BMI": "kg/m²",
}


# ── Data classes ────────────────────────────────────────────────────────────

@dataclass
class LabReading:
    name: str
    value: float
    unit: str
    date: str
    ref_low: Optional[float] = None
    ref_high: Optional[float] = None


@dataclass
class Condition:
    name: str
    onset: str      # YYYY-MM-DD
    status: str = "active"
    icd_code: str = ""


@dataclass
class Medication:
    name: str
    dose: str = ""
    status: str = "active"
    prescribed: str = ""


@dataclass
class PatientRecord:
    patient_name: str = "Unknown"
    dob: str = ""
    gender: str = ""
    conditions: list[Condition] = field(default_factory=list)
    medications: list[Medication] = field(default_factory=list)
    # labs: label → readings sorted oldest → newest
    labs: dict[str, list[LabReading]] = field(default_factory=dict)
    encounters: list[str] = field(default_factory=list)  # "YYYY-MM-DD: type"
    allergies: list[str] = field(default_factory=list)


# ── FHIR extraction ─────────────────────────────────────────────────────────

_FHIR_LAB_ALIASES: list[tuple[str, str]] = [
    ("hba1c", "HbA1c"), ("hemoglobin a1c", "HbA1c"), ("glycosylated", "HbA1c"),
    ("systolic blood pressure", "Systolic BP"), ("systolic", "Systolic BP"),
    ("diastolic blood pressure", "Diastolic BP"), ("diastolic", "Diastolic BP"),
    ("body weight", "Weight (kg)"), ("body mass index", "BMI"), ("bmi", "BMI"),
    ("glomerular filtration rate", "eGFR"), ("egfr", "eGFR"),
    ("creatinine", "Creatinine"),
    ("urine albumin-to-creatinine", "Urine ACR"), ("uacr", "Urine ACR"),
    ("cholesterol", "Total Cholesterol"), ("ldl", "LDL"), ("hdl", "HDL"),
    ("triglycerides", "Triglycerides"),
    ("tsh", "TSH"), ("thyroid stimulating hormone", "TSH"),
    ("potassium", "Potassium"),
    ("glucose", "Glucose"), ("fasting glucose", "Glucose"),
]


def _normalize_lab_name(raw: str) -> Optional[str]:
    raw = raw.lower().strip()
    for alias, label in _FHIR_LAB_ALIASES:
        if alias in raw:
            return label
    return None


def extract_from_fhir(record: dict) -> PatientRecord:
    """Build a PatientRecord from a full FHIR resource bundle (no LLM)."""
    p = record["patient"]
    pr = PatientRecord()

    # Demographics
    if p.get("name"):
        n = p["name"][0]
        given = " ".join(n.get("given", []))
        pr.patient_name = f"{given} {n.get('family', '')}".strip()
    pr.dob = p.get("birthDate", "")
    pr.gender = p.get("gender", "")

    # Conditions
    for c in record.get("conditions", []):
        code_text = c.get("code", {}).get("text", "")
        if not code_text:
            codings = c.get("code", {}).get("coding", [])
            code_text = codings[0].get("display", "Unknown") if codings else "Unknown"
        icd = ""
        codings = c.get("code", {}).get("coding", [])
        if codings:
            icd = codings[0].get("code", "")
        onset = c.get("onsetDateTime", c.get("onsetPeriod", {}).get("start", ""))
        if not onset:
            continue
        status = (c.get("clinicalStatus", {}).get("coding") or [{}])[0].get("code", "active")
        pr.conditions.append(Condition(name=code_text, onset=onset[:10], status=status, icd_code=icd))
    pr.conditions.sort(key=lambda x: x.onset)

    # Allergies
    for a in record.get("allergies", []):
        substance = a.get("code", {}).get("text", "") or (
            (a.get("code", {}).get("coding") or [{}])[0].get("display", "Unknown")
        )
        reactions = [
            m.get("text", (m.get("coding") or [{}])[0].get("display", ""))
            for r in a.get("reaction", [])
            for m in r.get("manifestation", [])
        ]
        pr.allergies.append(f"{substance}: {', '.join(reactions)}" if reactions else substance)

    # Medications
    for m in record.get("medications", []):
        med_text = (
            m.get("medicationCodeableConcept", {}).get("text")
            or (m.get("medicationCodeableConcept", {}).get("coding") or [{}])[0].get("display")
            or m.get("medicationReference", {}).get("display")
            or "Unknown"
        )
        dose = ""
        if m.get("dosageInstruction"):
            dose = m["dosageInstruction"][0].get("text", "")
        authored = m.get("authoredOn", "")
        pr.medications.append(Medication(
            name=med_text,
            dose=dose,
            status=m.get("status", "unknown"),
            prescribed=authored[:10] if authored else "",
        ))

    # Labs
    raw_labs: dict[str, list[LabReading]] = {}
    for o in record.get("observations", []):
        obs_text = o.get("code", {}).get("text", "") or (
            (o.get("code", {}).get("coding") or [{}])[0].get("display", "")
        )
        label = _normalize_lab_name(obs_text)
        if not label:
            continue
        vq = o.get("valueQuantity")
        if not vq or vq.get("value") is None:
            continue
        date_str = o.get("effectiveDateTime", o.get("issued", ""))[:10]
        ref = LAB_REFS.get(label)
        raw_labs.setdefault(label, []).append(LabReading(
            name=label,
            value=round(float(vq["value"]), 2),
            unit=vq.get("unit", LAB_UNITS.get(label, "")),
            date=date_str,
            ref_low=ref[0] if ref else None,
            ref_high=ref[1] if ref else None,
        ))

    pr.labs = _dedup_and_sort(raw_labs)

    # Encounters
    for enc in record.get("encounters", [])[:15]:
        enc_date = enc.get("period", {}).get("start", "")[:10]
        enc_type = "Visit"
        if enc.get("type"):
            codings = enc["type"][0].get("coding", [])
            enc_type = codings[0].get("display", enc["type"][0].get("text", "Visit")) if codings else "Visit"
        pr.encounters.append(f"{enc_date}: {enc_type}")

    return pr


# ── Page text extraction ────────────────────────────────────────────────────

_DATE_RE = re.compile(r"(\d{4}-\d{2}-\d{2})\s*[—\-–]")
_LAB_RE = re.compile(
    r"(HbA1c|Fasting\s+Glucose|Glucose|Total\s+Cholesterol|LDL|HDL|eGFR|Creatinine|"
    r"Urine\s+ACR|Blood\s+Pressure|Weight|BMI|Triglycerides|TSH|Potassium)"
    r"[\s:\t]+(\d+\.?\d*)(?:/(\d+\.?\d*))?\s*(%|mg/dL|mg/g|mL/min|mmol/L|kg|kg/m²|mIU/L|bpm|mmHg)?",
    re.IGNORECASE,
)
_PAGE_LAB_MAP: dict[str, str] = {
    "hba1c": "HbA1c", "fasting glucose": "Glucose", "glucose": "Glucose",
    "total cholesterol": "Total Cholesterol", "ldl": "LDL", "hdl": "HDL",
    "egfr": "eGFR", "creatinine": "Creatinine", "urine acr": "Urine ACR",
    "blood pressure": "Systolic BP", "weight": "Weight (kg)",
    "bmi": "BMI", "triglycerides": "Triglycerides", "tsh": "TSH", "potassium": "Potassium",
}
_COND_RE = re.compile(
    r"([A-Z][^(\n]{2,60}?)\s*\([A-Z0-9][A-Z0-9.\-]+\)\s*[—\-–]\s*(\d{4})",
    re.MULTILINE,
)


def extract_from_page_text(text: str, page_title: str = "") -> PatientRecord:
    """Build a PatientRecord from OSCAR-format plain text (no LLM)."""
    pr = PatientRecord()

    # Patient name from title "... Patient Chart: Last, First"
    if page_title:
        m = re.search(r":\s*(.+)$", page_title)
        if m:
            raw = m.group(1).strip()
            if "," in raw:
                last, first = raw.split(",", 1)
                pr.patient_name = f"{first.strip()} {last.strip()}"
            else:
                pr.patient_name = raw

    # Conditions from OSCAR sidebar format: "Name (ICD) — YYYY"
    seen_conds: set[str] = set()
    for m in _COND_RE.finditer(text):
        name = m.group(1).strip().rstrip(",. ")
        year = m.group(2)
        if name in seen_conds or len(name) < 3:
            continue
        seen_conds.add(name)
        pr.conditions.append(Condition(name=name, onset=f"{year}-01-01"))
    pr.conditions.sort(key=lambda x: x.onset)

    # Labs: split text by encounter date headers, extract values per chunk
    chunks = _split_by_date(text)
    raw_labs: dict[str, list[LabReading]] = {}
    for date_str, chunk in chunks:
        for m in _LAB_RE.finditer(chunk):
            raw_name = re.sub(r"\s+", " ", m.group(1).lower().strip())
            label = _PAGE_LAB_MAP.get(raw_name)
            if not label:
                continue
            try:
                value = round(float(m.group(2)), 2)
            except ValueError:
                continue
            unit = m.group(4) or LAB_UNITS.get(label, "")
            ref = LAB_REFS.get(label)
            raw_labs.setdefault(label, []).append(LabReading(
                name=label, value=value, unit=unit, date=date_str,
                ref_low=ref[0] if ref else None,
                ref_high=ref[1] if ref else None,
            ))
            # "Blood Pressure 120/80" — extract diastolic from the slash value
            if m.group(3) is not None and label == "Systolic BP":
                try:
                    dia_value = round(float(m.group(3)), 2)
                except ValueError:
                    pass
                else:
                    dia_ref = LAB_REFS.get("Diastolic BP")
                    raw_labs.setdefault("Diastolic BP", []).append(LabReading(
                        name="Diastolic BP", value=dia_value, unit=unit, date=date_str,
                        ref_low=dia_ref[0] if dia_ref else None,
                        ref_high=dia_ref[1] if dia_ref else None,
                    ))

    pr.labs = _dedup_and_sort(raw_labs)
    return pr


def _split_by_date(text: str) -> list[tuple[str, str]]:
    chunks: list[tuple[str, str]] = []
    parts = _DATE_RE.split(text)
    i = 0
    while i < len(parts):
        if re.match(r"\d{4}-\d{2}-\d{2}", parts[i]):
            chunks.append((parts[i], parts[i + 1] if i + 1 < len(parts) else ""))
            i += 2
        else:
            i += 1
    return chunks or [(date.today().isoformat(), text)]


def _dedup_and_sort(raw: dict[str, list[LabReading]]) -> dict[str, list[LabReading]]:
    result: dict[str, list[LabReading]] = {}
    for label, readings in raw.items():
        seen: set[str] = set()
        deduped = []
        for r in sorted(readings, key=lambda x: x.date):
            if r.date not in seen:
                seen.add(r.date)
                deduped.append(r)
        result[label] = deduped
    return result


# ── Clinical status helpers ─────────────────────────────────────────────────

def _reading_status(r: LabReading) -> str:
    if r.ref_low is None or r.ref_high is None:
        return ""
    if r.value > r.ref_high:
        return f"ABOVE TARGET (+{r.value - r.ref_high:.1f} above limit of {r.ref_high})"
    if r.value < r.ref_low:
        return f"BELOW TARGET (-{r.ref_low - r.value:.1f} below limit of {r.ref_low})"
    return "within target range"


def _trend_line(readings: list[LabReading]) -> str:
    if len(readings) < 2:
        return ""
    delta = readings[-1].value - readings[-2].value
    direction = "increased" if delta > 0 else "decreased" if delta < 0 else "unchanged"
    return f"Last change: {direction} by {abs(delta):.1f} ({readings[-2].value} → {readings[-1].value})"


def _consecutive_abnormal(readings: list[LabReading]) -> str:
    if not readings or readings[-1].ref_low is None:
        return ""
    count = sum(
        1 for r in reversed(readings)
        if r.value < r.ref_low or r.value > r.ref_high
        # stop counting once we hit an in-range reading
        for _ in [None] if True
    )
    # Simpler approach: count from end
    count = 0
    for r in reversed(readings):
        if r.ref_low is not None and (r.value < r.ref_low or r.value > r.ref_high):
            count += 1
        else:
            break
    return f"{count} consecutive out-of-target readings" if count >= 2 else ""


# ── Format structured record for LLM ────────────────────────────────────────

_LAB_PRIORITY = [
    "HbA1c", "Systolic BP", "Diastolic BP", "eGFR", "Creatinine",
    "Total Cholesterol", "LDL", "HDL", "Glucose", "Urine ACR",
    "TSH", "Potassium", "Triglycerides", "Weight (kg)", "BMI",
]


def format_for_llm(pr: PatientRecord) -> str:
    """
    Convert a PatientRecord into a structured, unambiguous context for the LLM.

    All clinical values are pre-extracted and pre-computed — the LLM must interpret
    this data, not re-extract or estimate anything from raw text.
    """
    lines: list[str] = []
    today = date.today().isoformat()

    lines.append("## Patient")
    lines.append(f"Name: {pr.patient_name}")
    if pr.dob:
        lines.append(f"DOB: {pr.dob}")
    if pr.gender:
        lines.append(f"Gender: {pr.gender}")
    lines.append("")

    if pr.allergies:
        lines.append("## Allergies")
        for a in pr.allergies:
            lines.append(f"- {a}")
        lines.append("")

    if pr.conditions:
        lines.append(f"## Active Conditions ({len(pr.conditions)})")
        for c in pr.conditions:
            icd = f" [{c.icd_code}]" if c.icd_code else ""
            lines.append(f"- {c.name}{icd} — since {c.onset[:4]} [{c.status}]")
        lines.append("")

    if pr.medications:
        active_meds = [m for m in pr.medications if m.status == "active"]
        other_meds = [m for m in pr.medications if m.status != "active"]
        lines.append(f"## Current Medications ({len(active_meds)} active)")
        for m in active_meds:
            dose_str = f" — {m.dose}" if m.dose else ""
            since = f" (since {m.prescribed[:7]})" if m.prescribed else ""
            lines.append(f"- {m.name}{dose_str}{since}")
        if other_meds:
            lines.append("## Stopped / Inactive Medications")
            for m in other_meds:
                lines.append(f"- {m.name} [{m.status}]")
        lines.append("")

    if pr.labs:
        lines.append("## Lab Results (pre-extracted — interpret these values, do not re-read or estimate)")
        lines.append("")
        ordered = [k for k in _LAB_PRIORITY if k in pr.labs] + \
                  [k for k in pr.labs if k not in _LAB_PRIORITY]

        for label in ordered:
            readings = pr.labs[label]
            ref_low = readings[0].ref_low
            ref_high = readings[0].ref_high
            unit = readings[-1].unit
            ref_str = f"target {ref_low}–{ref_high} {unit}" if ref_low is not None else "no reference range"
            lines.append(f"### {label} [{ref_str}]")
            for r in reversed(readings):
                status = _reading_status(r)
                flag = " ⚠" if "ABOVE" in status or "BELOW" in status else " ✓"
                lines.append(f"  {r.date}: {r.value} {r.unit}{flag}  {status}")
            trend = _trend_line(readings)
            if trend:
                lines.append(f"  → {trend}")
            consec = _consecutive_abnormal(readings)
            if consec:
                lines.append(f"  → {consec}")
            lines.append("")

    if pr.encounters:
        lines.append("## Encounter History")
        for e in pr.encounters[:12]:
            lines.append(f"- {e}")
        lines.append("")

    lines.append(f"[Extracted: {today}]")
    lines.append("NOTE: All values above were extracted deterministically.")
    lines.append("Your job is clinical INTERPRETATION only — do not invent, estimate, or re-read values.")

    return "\n".join(lines)


# ── Convert to frontend chart format ────────────────────────────────────────

def to_lab_trends(pr: PatientRecord) -> dict[str, list[dict]]:
    """Convert PatientRecord labs to the {date, value, unit, refLow, refHigh} format for charts."""
    result: dict[str, list[dict]] = {}
    for label, readings in pr.labs.items():
        result[label] = [
            {
                "date": r.date,
                "value": r.value,
                "unit": r.unit,
                **({"refLow": r.ref_low, "refHigh": r.ref_high} if r.ref_low is not None else {}),
            }
            for r in readings
        ]
    return result


def to_conditions_timeline(pr: PatientRecord) -> list[dict]:
    """Convert PatientRecord conditions to the {name, onset, status} format for timeline."""
    return [
        {"name": c.name, "onset": c.onset, "status": c.status}
        for c in pr.conditions
    ]
