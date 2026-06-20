# Charted — AI Clinical Decision Support Chrome Extension

A Chrome extension that injects a clinical decision support sidebar into OSCAR Pro (or any webpage during demo/development). Built for the **Hackers & Healers 2026** hackathon.

---

## What it does

Charted gives primary care physicians a sidebar panel that:

- **Analyzes a patient record** and surfaces flagged items (overdue labs, missed screenings, monitoring gaps) colour-coded by urgency
- **Suggests one-click actions** (order labs, generate referral, draft a follow-up plan) — clicking generates the document inline using Claude
- **Shows a medication safety note** flagging interactions, monitoring gaps, and deprescribing opportunities
- **Free-text "Ask AI"** input — type any question about the patient and Claude answers in context

---

## Dev setup (load unpacked in Chrome)

1. Clone the repo
2. Open Chrome → `chrome://extensions` → enable **Developer Mode** (top-right toggle)
3. Click **Load Unpacked** → select the `careassist/` folder
4. Click the Charted icon in the Chrome toolbar → open the **side panel**
5. Click the extension icon → **Options** (or right-click → Options) → paste your Anthropic API key → Save
6. Open any webpage (or a saved OSCAR screenshot HTML file)
7. Click the Charted icon in the Chrome toolbar to open the side panel
8. Select a patient from the dropdown → click **Analyze Patient**

---

## Project structure

```
careassist/
  manifest.json      Manifest V3 config
  background.js      Service worker — handles Anthropic API calls
  content.js         Content script (placeholder for OSCAR DOM integration)
  sidebar.html       Side panel UI
  sidebar.js         All logic: FHIR parsing, Claude calls, rendering
  sidebar.css        Visual design
  options.html       Settings page for API key
  options.js         Options page logic
  patients/
    patient_001.json  Margaret Tremblay — diabetes, hypertension, osteoporosis (78F)
    patient_002.json  Robert Kowalski — heart failure, polypharmacy (62M)
    patient_003.json  Linh Nguyen — bipolar disorder, lithium monitoring (30F)
  icons/
    icon16/48/128.png Extension icons
```

---

## Synthetic patient data

Patient records are **Synthea-style FHIR R4 bundles** (hardcoded JSON files). Three realistic Canadian primary care patients:

| File | Patient | Key conditions |
|------|---------|----------------|
| `patient_001.json` | Margaret Tremblay, 78F | Type 2 DM, HTN, osteoporosis, hypothyroidism |
| `patient_002.json` | Robert Kowalski, 62M | CHF (EF 35%), AF, CKD stage 3, 7 medications |
| `patient_003.json` | Linh Nguyen, 30F | Bipolar I, anxiety, lithium monitoring |

Observations are intentionally backdated to trigger overdue flags (dates >12 months ago).

> **Synthea** is an open-source synthetic patient generator: https://synthetichealth.github.io/synthea/

---

## Production integration path (for judges)

This prototype uses local JSON files. In production, the integration would follow the **SMART on FHIR** standard:

1. OSCAR Pro (or any FHIR-compliant EHR) exposes a **FHIR R4 REST API**
2. Charted registers as a SMART app, receives an OAuth2 launch token when the physician opens a patient chart
3. The extension exchanges the token for a scoped FHIR access token and fetches real patient data (`/Patient`, `/Condition`, `/MedicationRequest`, `/Observation`)
4. The same `parseFHIR()` function processes live data — no other changes required

**SMART on FHIR docs:** https://docs.smarthealthit.org/

---

## AI stack

All analysis is powered by **Claude claude-sonnet-4-6** (Anthropic) via the Messages API. The extension's service worker (`background.js`) makes direct HTTPS calls to `api.anthropic.com` — no backend server required.

API key is stored in `chrome.storage.local` and never leaves the browser except in the `x-api-key` header sent to Anthropic.

---

## Permissions

| Permission | Why |
|-----------|-----|
| `sidePanel` | Native Chrome side panel API |
| `storage` | Store API key locally |
| `activeTab` / `scripting` | Future OSCAR DOM integration |
| `host_permissions: api.anthropic.com` | Direct API calls from service worker |

---

## Limitations (hackathon scope)

- No real OSCAR connection — synthetic data only
- API key stored in plain `chrome.storage.local` (production would use a backend proxy)
- No streaming responses (single-shot API calls)
- English only
