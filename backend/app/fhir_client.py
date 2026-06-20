import asyncio
import httpx
import os
from dotenv import load_dotenv

load_dotenv()

FHIR_BASE_URL = os.getenv("FHIR_BASE_URL", "https://hapi.fhir.org/baseR4")

_client = httpx.AsyncClient(timeout=30.0)


async def _get(path: str, params: dict | None = None) -> dict:
    for attempt in range(4):
        resp = await _client.get(f"{FHIR_BASE_URL}/{path}", params={**(params or {}), "_format": "json"})
        if resp.status_code == 429:
            await asyncio.sleep(1.5 * (attempt + 1))
            continue
        resp.raise_for_status()
        return resp.json()
    resp.raise_for_status()
    return resp.json()


async def get_patient(patient_id: str) -> dict:
    return await _get(f"Patient/{patient_id}")


async def search_patients(name: str = "", count: int = 20) -> list[dict]:
    params = {"_count": str(count)}
    if name:
        params["name"] = name
    bundle = await _get("Patient", params)
    return [entry["resource"] for entry in bundle.get("entry", [])]


async def get_conditions(patient_id: str) -> list[dict]:
    bundle = await _get("Condition", {"patient": patient_id, "_count": "100", "_sort": "-onset-date"})
    return [entry["resource"] for entry in bundle.get("entry", [])]


async def get_encounters(patient_id: str) -> list[dict]:
    bundle = await _get("Encounter", {"patient": patient_id, "_count": "100", "_sort": "-date"})
    return [entry["resource"] for entry in bundle.get("entry", [])]


async def get_medications(patient_id: str) -> list[dict]:
    bundle = await _get("MedicationRequest", {"patient": patient_id, "_count": "100"})
    return [entry["resource"] for entry in bundle.get("entry", [])]


async def get_observations(patient_id: str) -> list[dict]:
    bundle = await _get("Observation", {"patient": patient_id, "_count": "100", "_sort": "-date"})
    return [entry["resource"] for entry in bundle.get("entry", [])]


async def get_care_plans(patient_id: str) -> list[dict]:
    bundle = await _get("CarePlan", {"patient": patient_id, "_count": "50"})
    return [entry["resource"] for entry in bundle.get("entry", [])]


async def get_allergies(patient_id: str) -> list[dict]:
    bundle = await _get("AllergyIntolerance", {"patient": patient_id, "_count": "50"})
    return [entry["resource"] for entry in bundle.get("entry", [])]


async def get_full_patient_record(patient_id: str) -> dict:
    """Fetch all relevant FHIR resources for a patient sequentially to avoid rate limits."""
    patient = await get_patient(patient_id)
    conditions = await get_conditions(patient_id)
    encounters = await get_encounters(patient_id)
    medications = await get_medications(patient_id)
    observations = await get_observations(patient_id)
    care_plans = await get_care_plans(patient_id)
    allergies = await get_allergies(patient_id)
    return {
        "patient": patient,
        "conditions": conditions,
        "encounters": encounters,
        "medications": medications,
        "observations": observations,
        "care_plans": care_plans,
        "allergies": allergies,
    }


def format_patient_timeline(record: dict) -> str:
    """Convert a full FHIR patient record into a readable clinical timeline for the LLM."""
    lines = []
    p = record["patient"]

    name = "Unknown"
    if p.get("name"):
        n = p["name"][0]
        given = " ".join(n.get("given", []))
        family = n.get("family", "")
        name = f"{given} {family}".strip()

    lines.append(f"PATIENT: {name} | DOB: {p.get('birthDate', 'Unknown')} | Gender: {p.get('gender', 'Unknown')}")
    lines.append(f"Patient ID: {p.get('id', 'Unknown')}")
    if p.get("address"):
        addr = p["address"][0]
        lines.append(f"Location: {addr.get('city', '')}, {addr.get('state', '')}")
    lines.append("")

    if record["conditions"]:
        lines.append("=== ACTIVE CONDITIONS ===")
        for c in record["conditions"]:
            code_text = c.get("code", {}).get("text", "")
            if not code_text:
                codings = c.get("code", {}).get("coding", [])
                code_text = codings[0].get("display", "Unknown") if codings else "Unknown"
            status = c.get("clinicalStatus", {}).get("coding", [{}])[0].get("code", "unknown")
            onset = c.get("onsetDateTime", c.get("onsetPeriod", {}).get("start", "Unknown"))
            lines.append(f"- {code_text} (status: {status}, onset: {onset})")
        lines.append("")

    if record["allergies"]:
        lines.append("=== ALLERGIES ===")
        for a in record["allergies"]:
            substance = a.get("code", {}).get("text", "Unknown")
            if not substance or substance == "Unknown":
                codings = a.get("code", {}).get("coding", [])
                substance = codings[0].get("display", "Unknown") if codings else "Unknown"
            reactions = []
            for r in a.get("reaction", []):
                for m in r.get("manifestation", []):
                    reactions.append(m.get("text", m.get("coding", [{}])[0].get("display", "")))
            lines.append(f"- {substance}: {', '.join(reactions) if reactions else 'No reaction details'}")
        lines.append("")

    if record["medications"]:
        lines.append("=== MEDICATIONS ===")
        for m in record["medications"]:
            med_text = ""
            if m.get("medicationCodeableConcept"):
                med_text = m["medicationCodeableConcept"].get("text", "")
                if not med_text:
                    codings = m["medicationCodeableConcept"].get("coding", [])
                    med_text = codings[0].get("display", "Unknown") if codings else "Unknown"
            elif m.get("medicationReference"):
                med_text = m["medicationReference"].get("display", "Unknown")
            status = m.get("status", "unknown")
            authored = m.get("authoredOn", "Unknown date")
            lines.append(f"- {med_text} (status: {status}, prescribed: {authored})")
        lines.append("")

    if record["observations"]:
        lines.append("=== RECENT OBSERVATIONS / LAB RESULTS ===")
        for o in record["observations"][:30]:
            obs_text = o.get("code", {}).get("text", "")
            if not obs_text:
                codings = o.get("code", {}).get("coding", [])
                obs_text = codings[0].get("display", "Unknown") if codings else "Unknown"
            date = o.get("effectiveDateTime", o.get("issued", "Unknown"))
            value = ""
            if o.get("valueQuantity"):
                vq = o["valueQuantity"]
                value = f"{vq.get('value', '')} {vq.get('unit', '')}"
            elif o.get("valueCodeableConcept"):
                value = o["valueCodeableConcept"].get("text", str(o["valueCodeableConcept"].get("coding", [{}])[0].get("display", "")))
            elif o.get("valueString"):
                value = o["valueString"]
            lines.append(f"- {obs_text}: {value} ({date})")
        lines.append("")

    if record["encounters"]:
        lines.append("=== ENCOUNTER HISTORY (most recent first) ===")
        for enc in record["encounters"][:15]:
            enc_date = enc.get("period", {}).get("start", "Unknown")
            enc_class = enc.get("class", {}).get("display", enc.get("class", {}).get("code", "Unknown"))
            enc_type = "Unknown"
            if enc.get("type"):
                codings = enc["type"][0].get("coding", [])
                enc_type = codings[0].get("display", "Unknown") if codings else enc["type"][0].get("text", "Unknown")
            reason = ""
            if enc.get("reasonCode"):
                reasons = [r.get("text", r.get("coding", [{}])[0].get("display", "")) for r in enc["reasonCode"]]
                reason = f" — Reason: {'; '.join(reasons)}"
            lines.append(f"- {enc_date} | {enc_class} | {enc_type}{reason}")
        lines.append("")

    if record["care_plans"]:
        lines.append("=== CARE PLANS ===")
        for cp in record["care_plans"][:10]:
            title = cp.get("title", "")
            if not title:
                cats = cp.get("category", [{}])
                if cats and cats[0].get("coding"):
                    title = cats[0]["coding"][0].get("display", "Care Plan")
            status = cp.get("status", "unknown")
            lines.append(f"- {title} (status: {status})")
            for activity in cp.get("activity", []):
                detail = activity.get("detail", {})
                act_text = detail.get("code", {}).get("text", "")
                if not act_text:
                    codings = detail.get("code", {}).get("coding", [])
                    act_text = codings[0].get("display", "") if codings else ""
                if act_text:
                    lines.append(f"  - {act_text} (status: {detail.get('status', 'unknown')})")
        lines.append("")

    return "\n".join(lines)
