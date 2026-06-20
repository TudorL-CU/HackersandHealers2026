# Charted: An AI EMR Helper

A Chrome extension that reads any web-based EMR and gives clinicians a complete patient picture in 30 seconds. No new login, no copy-pasting, no switching tabs.

## What It Does

Click **Analyze Patient** in the sidebar and get:

- **Conditions Timeline** — clickable, with drill-down into visit-by-visit progression
- **What Changed** — specific values, not vague summaries
- **What Needs Attention** — risks likely to fall through the cracks
- **Recommended Actions** — concrete next steps for this visit

## Tech Stack

- **Extension:** Chrome Side Panel API
- **Backend:** Python, FastAPI, LangGraph, LangChain
- **LLM:** Claude (Anthropic)
- **Data:** FHIR R4, Synthea synthetic records

## Setup

```bash
# Backend
cd backend && python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # add ANTHROPIC_API_KEY
uvicorn app.main:app --reload

# Extension
# chrome://extensions → Developer Mode → Load unpacked → select extension/
```

