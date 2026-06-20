# Charted: An AI EMR Helper


Sometimes EMR's can be confusing to read and it can take a while to deduct what a patient needs. With Charted, a web extension, you can view any web-based EMR and create a patient profile with a plan on what to address during their appointment.


**Longitudinal patient intelligence for primary care clinicians.**

By having Charted create condition-specific charts, clinicians can directly see the history of a single condition rather than combing through potentially years worth of irrelevant data in the patients EMR.


**Remove unnecessary tools for EMR analysis**

Clinicians often use third party tools like Heidi to generate EMR summaries. However, this slows workflow as clinicians have to work through a separate app and copy-paste EMR data. By integrating a web extension directly, clinicians can analyze EMR's without the need for additional tools.


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
AI workflow agent


Continuity Copilot

Combine 3 things:

Longitudinal patient summary
What changed since last visit
What is likely to fall through the cracks

One screen:

PATIENT STORY

Who is this patient?
[summary]

What changed?
[new findings]

What needs attention?
[risks]

Recommended next actions
[action list]

Why I like it:

Unique compared to typical AI healthcare projects.
Directly addresses the most distinctive clinician request.
Strong AI component (RAG, summarization, reasoning).
Easy to demo with synthetic patient records.
Fits your background with LangGraph, OCR, document processing, and LLM pipelines.
