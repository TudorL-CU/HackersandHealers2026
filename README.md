# Continuity Copilot

**Longitudinal patient intelligence for primary care clinicians.**

A clinician opens a patient chart and sees one screen with everything they need: who this patient is, what changed since the last visit, what's likely to fall through the cracks, and what to do next. Built for the Hackers & Healers 2026 hackathon.

## The Problem

Primary care clinicians spend minutes per patient piecing together a longitudinal story from fragmented EHR data. Critical information — overdue referrals, trending lab values, care gaps from covering providers — falls through the cracks. The result: reactive care instead of proactive care.

## The Solution

Continuity Copilot connects to a FHIR R4 server, pulls a patient's full record (conditions, encounters, medications, labs, care plans, allergies), and runs a multi-stage AI analysis pipeline:

1. **Patient Story** — A concise longitudinal summary of who this patient is
2. **What Changed** — Clinically significant changes since the last visit
3. **What Needs Attention** — Risks likely to fall through the cracks
4. **Recommended Actions** — Concrete, actionable next steps for the clinician

All four sections appear on a single screen, designed for a 30-second pre-visit review.

## Architecture

```
HAPI FHIR Server (R4)          React Frontend
     |                              |
     v                              v
  FastAPI  <--- REST API --->  One-Screen View
     |
     v
  LangGraph Pipeline
     |
     +-- Summarizer (patient story)
     +-- Change Detector (what's different)
     +-- Risk Analyzer (what might be missed)
     +-- Action Recommender (what to do next)
     |
     v
  GPT-4o (OpenAI)
```

**Data source:** [HAPI FHIR R4 test server](https://hapi.fhir.org/) — pre-loaded with Synthea-generated synthetic patients. No real patient data.

## Tech Stack

- **Backend:** Python, FastAPI, LangGraph, LangChain
- **LLM:** GPT-4o (OpenAI)
- **Data:** FHIR R4 via HAPI FHIR public test server
- **Frontend:** React (Vite)

## Setup

### Prerequisites
- Python 3.11+
- Node.js 18+
- OpenAI API key

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000. Search for a patient, select one, and see the Continuity Copilot analysis.

## Design Principles (from clinician co-design)

- **Integration over fragmentation** — One screen, no extra logins
- **Low cognitive burden** — Concise, scannable, relevance-filtered
- **Actionable outputs** — Not just text, but checkable action items
- **Calibrated trust** — Shows confidence, invites clinician override
- **Proactive, not reactive** — Flags what's overdue and what's pending
- **Privacy by design** — Synthetic data only; architecture supports local processing

## Team

Hackers & Healers 2026 — University of Ottawa / Bruyere Health / AGI Ventures Canada
