import json
from pathlib import Path

DATA_DIR = Path(__file__).parent / "synthetic"


def load_patient(patient_id: str) -> dict:
    filepath = DATA_DIR / f"{patient_id}.json"
    if not filepath.exists():
        raise FileNotFoundError(f"No data found for patient {patient_id}")
    with open(filepath) as f:
        return json.load(f)


def list_patients() -> list[dict]:
    patients = []
    for filepath in sorted(DATA_DIR.glob("*.json")):
        with open(filepath) as f:
            data = json.load(f)
        patient = data["patient"]
        patients.append({
            "id": patient["id"],
            "name": patient["name"],
            "date_of_birth": patient["date_of_birth"],
            "conditions_count": len(data.get("conditions", [])),
            "encounters_count": len(data.get("encounters", [])),
        })
    return patients


def get_patient_timeline(patient_data: dict) -> str:
    lines = []
    patient = patient_data["patient"]
    lines.append(f"PATIENT: {patient['name']} | DOB: {patient['date_of_birth']} | Gender: {patient['gender']}")
    lines.append(f"PCP: {patient.get('primary_care_provider', 'Unknown')}")
    lines.append("")

    lines.append("=== CONDITIONS ===")
    for c in patient_data.get("conditions", []):
        lines.append(f"- {c['description']} ({c['code']}) — onset {c['onset_date']}, {c['status']}")
    lines.append("")

    lines.append("=== CURRENT MEDICATIONS ===")
    for m in patient_data.get("medications", []):
        if m.get("status") == "active":
            lines.append(f"- {m['name']} {m['frequency']} (since {m['prescribed_date']})")
    lines.append("")

    lines.append("=== ALLERGIES ===")
    for a in patient_data.get("allergies", []):
        lines.append(f"- {a['substance']}: {a['reaction']} (severity: {a['severity']})")
    lines.append("")

    lines.append("=== ENCOUNTER HISTORY (chronological) ===")
    for enc in sorted(patient_data.get("encounters", []), key=lambda e: e["date"]):
        lines.append(f"\n--- {enc['date']} | {enc['type']} | Provider: {enc['provider']} ---")
        lines.append(f"Reason: {enc['reason']}")
        if enc.get("vitals"):
            v = enc["vitals"]
            lines.append(f"Vitals: BP {v.get('blood_pressure', 'N/A')}, HR {v.get('heart_rate', 'N/A')}, Weight {v.get('weight_lbs', 'N/A')} lbs, BMI {v.get('bmi', 'N/A')}")
        lines.append(f"Notes: {enc['notes']}")
        if enc.get("lab_results"):
            lines.append("Lab Results:")
            for lab in enc["lab_results"]:
                flag = f" [{lab['flag'].upper()}]" if lab.get("flag") and lab["flag"] != "normal" else ""
                lines.append(f"  - {lab['test']}: {lab['value']} (ref: {lab['reference_range']}){flag}")
        if enc.get("labs_ordered"):
            lines.append(f"Labs Ordered: {', '.join(enc['labs_ordered'])}")
    lines.append("")

    lines.append("=== PREVENTIVE CARE ===")
    for key, val in patient_data.get("preventive_care", {}).items():
        lines.append(f"- {key.replace('_', ' ').title()}: {val}")
    lines.append("")

    lines.append("=== SOCIAL HISTORY ===")
    for key, val in patient_data.get("social_history", {}).items():
        lines.append(f"- {key.replace('_', ' ').title()}: {val}")

    return "\n".join(lines)
