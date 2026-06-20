'use strict';

const SYSTEM_PROMPT = `You are a clinical decision support assistant for a Canadian family physician. You will be given a structured patient summary. Your job is to:
1. Identify items that are overdue or need attention (labs, screenings, monitoring for high-risk medications, immunizations)
2. Suggest 2-3 specific actionable next steps the physician should take today
3. Write a brief medication safety note flagging any interactions, monitoring gaps, or deprescribing opportunities
4. Classify each flag as URGENT (red) or ATTENTION (amber)

Respond ONLY in this JSON format with no extra text:
{
  "flags": [
    { "severity": "urgent" | "attention", "text": "..." }
  ],
  "actions": [
    { "label": "...", "prompt": "..." }
  ],
  "medicationNote": "..."
}`;

// ── Lab reference ranges ───────────────────────────────────────────────────
// Each entry: { label, unit, rangeLo, rangeHi, normalLo, normalHi,
//               warnHi?, warnLo?, reverseWarn? }
// reverseWarn=true means LOW values are bad (eGFR, Vitamin D)
const LAB_REFS = [
  { keys: ['hba1c','hemoglobin a1c'], label:'HbA1c',       unit:'%',         rangeLo:4,   rangeHi:14,  normalLo:4,   normalHi:5.7,  warnHi:8.5 },
  { keys: ['creatinine'],             label:'Creatinine',  unit:'µmol/L',    rangeLo:40,  rangeHi:250, normalLo:45,  normalHi:100,  warnHi:150 },
  { keys: ['tsh','thyroid stimulat'], label:'TSH',          unit:'mIU/L',     rangeLo:0,   rangeHi:12,  normalLo:0.4, normalHi:4.0,  warnHi:8.0 },
  { keys: ['total cholesterol'],      label:'Cholesterol', unit:'mmol/L',    rangeLo:2,   rangeHi:10,  normalLo:2,   normalHi:5.2,  warnHi:7.0 },
  { keys: ['vitamin d','25-oh'],      label:'Vitamin D',   unit:'nmol/L',    rangeLo:0,   rangeHi:250, normalLo:75,  normalHi:250,  warnLo:50,  reverseWarn:true },
  { keys: ['inr'],                    label:'INR',          unit:'',          rangeLo:0,   rangeHi:5,   normalLo:0.8, normalHi:1.2,  warnHi:3.5 },
  { keys: ['potassium'],              label:'K⁺',           unit:'mmol/L',    rangeLo:2,   rangeHi:7,   normalLo:3.5, normalHi:5.0,  warnHi:5.5, warnLo:3.0 },
  { keys: ['egfr','ckd-epi'],         label:'eGFR',         unit:'mL/min',    rangeLo:0,   rangeHi:120, normalLo:60,  normalHi:120,  warnLo:30,  reverseWarn:true },
  { keys: ['glucose','fasting blood'],'label':'Glucose',   unit:'mmol/L',    rangeLo:2,   rangeHi:20,  normalLo:3.9, normalHi:6.1,  warnHi:10 },
  { keys: ['lithium'],                label:'Lithium',      unit:'mmol/L',    rangeLo:0,   rangeHi:2.5, normalLo:0.6, normalHi:1.2,  warnHi:1.5, warnLo:0.4 },
  { keys: ['albumin','acr','urine a'],'label':'uACR',      unit:'mg/mmol',   rangeLo:0,   rangeHi:100, normalLo:0,   normalHi:3,    warnHi:30 },
  { keys: ['weight','body weight'],   label:'Weight',       unit:'kg',        rangeLo:30,  rangeHi:150, normalLo:45,  normalHi:100 },
];

function matchLabRef(name) {
  const n = name.toLowerCase();
  return LAB_REFS.find((r) => r.keys.some((k) => n.includes(k))) || null;
}

function getLabStatus(numVal, ref) {
  if (ref.reverseWarn) {
    if (ref.warnLo != null && numVal < ref.warnLo) return 'urgent';
    if (numVal < ref.normalLo) return 'warn';
    return 'ok';
  } else {
    if (ref.warnHi != null && numVal > ref.warnHi) return 'urgent';
    if (numVal > ref.normalHi) return 'warn';
    if (ref.warnLo != null && numVal < ref.warnLo) return 'urgent';
    if (ref.normalLo != null && numVal < ref.normalLo) return 'warn';
    return 'ok';
  }
}

function buildTrackGradient(ref) {
  const { rangeLo, rangeHi, normalLo, normalHi, warnHi, warnLo, reverseWarn } = ref;
  const span = rangeHi - rangeLo;
  const pct = (v) => `${Math.max(0, Math.min(100, (v - rangeLo) / span * 100)).toFixed(1)}%`;

  const RED  = '#FECACA';
  const AMB  = '#FDE68A';
  const GRN  = '#A7F3D0';

  if (reverseWarn) {
    const wL = warnLo != null ? warnLo : normalLo * 0.7;
    return `linear-gradient(to right,${RED} 0%,${RED} ${pct(wL)},${AMB} ${pct(wL)},${AMB} ${pct(normalLo)},${GRN} ${pct(normalLo)},${GRN} 100%)`;
  } else {
    const wH = warnHi != null ? warnHi : normalHi * 1.3;
    return `linear-gradient(to right,${RED} 0%,${RED} ${pct(normalLo)},${GRN} ${pct(normalLo)},${GRN} ${pct(normalHi)},${AMB} ${pct(normalHi)},${AMB} ${pct(wH)},${RED} ${pct(wH)},${RED} 100%)`;
  }
}

// ── State ──────────────────────────────────────────────────────────────────
let currentPatientSummary = null;
let currentParsed = null;

// ── DOM refs ───────────────────────────────────────────────────────────────
const patientSelect  = document.getElementById('patient-select');
const analyzeBtn     = document.getElementById('analyze-btn');
const headerPatName  = document.getElementById('header-patient-name');
const patientInfo    = document.getElementById('patient-info');
const loading        = document.getElementById('loading');
const results        = document.getElementById('results');
const errorBanner    = document.getElementById('error-banner');
const errorText      = document.getElementById('error-text');
const flagsContainer = document.getElementById('flags-container');
const actionsContainer = document.getElementById('actions-container');
const actionResult   = document.getElementById('action-result');
const actionResultLabel = document.getElementById('action-result-label');
const actionResultClose = document.getElementById('action-result-close');
const actionResultContent = document.getElementById('action-result-content');
const askSection     = document.getElementById('ask-section');
const askInput       = document.getElementById('ask-input');
const askBtn         = document.getElementById('ask-btn');
const askResult      = document.getElementById('ask-result');
const newPatientBtn  = document.getElementById('new-patient-btn');

// ── Events ─────────────────────────────────────────────────────────────────
patientSelect.addEventListener('change', () => { analyzeBtn.disabled = !patientSelect.value; });
analyzeBtn.addEventListener('click', () => { if (patientSelect.value) runAnalysis(patientSelect.value); });
actionResultClose.addEventListener('click', () => actionResult.classList.add('hidden'));
askBtn.addEventListener('click', handleAskAI);
askInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleAskAI(); });
newPatientBtn.addEventListener('click', resetToPickerView);

// ── FHIR parsing ───────────────────────────────────────────────────────────
function parseFHIR(bundle) {
  const resources = (bundle.entry || []).map((e) => e.resource);

  const patient = resources.find((r) => r.resourceType === 'Patient');
  const name = patient?.name?.[0];
  const fullName = [...(name?.given || []), name?.family].filter(Boolean).join(' ');
  const dob = patient?.birthDate || '';
  const age = dob ? Math.floor((Date.now() - new Date(dob)) / (365.25 * 24 * 3600 * 1000)) : '?';
  const gender = patient?.gender || 'unknown';

  const conditions = resources
    .filter((r) => r.resourceType === 'Condition' && r.clinicalStatus?.coding?.[0]?.code === 'active')
    .map((r) => ({ name: r.code?.text || r.code?.coding?.[0]?.display || 'Unknown', onset: r.onsetDateTime || '' }));

  const medications = resources
    .filter((r) => r.resourceType === 'MedicationRequest' && r.status === 'active')
    .map((r) => ({ name: r.medicationCodeableConcept?.text || r.medicationCodeableConcept?.coding?.[0]?.display || 'Unknown', started: r.authoredOn || '' }));

  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);

  const observations = resources
    .filter((r) => r.resourceType === 'Observation')
    .map((r) => {
      const date = r.effectiveDateTime || r.effectivePeriod?.start || '';
      const numVal = r.valueQuantity?.value;
      return {
        name: r.code?.text || r.code?.coding?.[0]?.display || 'Unknown lab',
        value: numVal != null ? String(numVal) : 'N/A',
        unit: r.valueQuantity?.unit || '',
        numVal: numVal != null ? numVal : null,
        date,
        overdue: date ? new Date(date) < cutoff : false,
      };
    });

  return { fullName, age, dob, gender, conditions, medications, observations };
}

function buildPatientSummaryText({ fullName, age, dob, gender, conditions, medications, observations }) {
  const conds = conditions.map((c) => `  - ${c.name} (since ${c.onset})`).join('\n');
  const meds  = medications.map((m) => `  - ${m.name} (started ${m.started})`).join('\n');
  const obs   = observations.map((o) => `  - ${o.name}: ${o.value} ${o.unit} on ${o.date}${o.overdue ? ' [OVERDUE]' : ''}`).join('\n');
  return `Patient: ${fullName}, ${age}yo ${gender}, DOB ${dob}\n\nActive Conditions:\n${conds||'  None'}\n\nMedications:\n${meds||'  None'}\n\nLabs:\n${obs||'  None'}`;
}

// ── Render patient info ────────────────────────────────────────────────────
function renderPatientInfo({ fullName, age, dob, gender, conditions, observations }) {
  document.getElementById('patient-card-name').textContent = fullName;
  document.getElementById('patient-card-meta').textContent =
    `${age} yrs · ${gender.charAt(0).toUpperCase() + gender.slice(1)} · DOB ${dob}`;

  const medCount = currentParsed?.medications?.length || 0;
  document.getElementById('patient-card-badge').textContent = `${medCount} meds`;

  const wrap = document.getElementById('conditions-wrap');
  wrap.innerHTML = '';
  conditions.slice(0, 5).forEach((c) => {
    const chip = document.createElement('span');
    chip.className = 'condition-chip';
    chip.textContent = c.name;
    wrap.appendChild(chip);
  });

  renderLabGrid(observations);
  patientInfo.classList.remove('hidden');
}

// ── Lab grid ───────────────────────────────────────────────────────────────
function renderLabGrid(observations) {
  const grid = document.getElementById('lab-grid');
  grid.innerHTML = '';

  const overdueCount = observations.filter((o) => o.overdue).length;
  const badge = document.getElementById('overdue-count-badge');
  if (overdueCount > 0) {
    badge.textContent = `${overdueCount} overdue`;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }

  // Update summary overdue count (shown after Claude returns)
  const overdueEl = document.getElementById('overdue-labs-count');
  if (overdueEl) overdueEl.textContent = overdueCount;

  observations.forEach((obs) => {
    const ref = matchLabRef(obs.name);
    const numVal = obs.numVal;

    let status = 'ok';
    if (ref && numVal != null) status = getLabStatus(numVal, ref);

    const card = document.createElement('div');
    card.className = `lab-card lab-${status}`;

    const shortLabel = ref ? ref.label : obs.name.split(' ').slice(0,2).join(' ');
    const unit = ref ? ref.unit : obs.unit;

    // Range bar
    let barHtml = '';
    if (ref && numVal != null) {
      const { rangeLo, rangeHi } = ref;
      const markerPct = Math.max(2, Math.min(96, (numVal - rangeLo) / (rangeHi - rangeLo) * 100));
      const markerColor = status === 'urgent' ? '#DC2626' : status === 'warn' ? '#D97706' : '#059669';
      const gradient = buildTrackGradient(ref);
      barHtml = `
        <div class="range-track" style="background:${gradient}">
          <div class="range-marker" style="left:${markerPct.toFixed(1)}%;color:${markerColor}"></div>
        </div>`;
    }

    const dateStr = obs.date ? new Date(obs.date).toLocaleDateString('en-CA', { month:'short', year:'numeric' }) : '';

    card.innerHTML = `
      <div class="lab-card-name">${escHtml(shortLabel)}</div>
      <div>
        <span class="lab-card-value">${escHtml(obs.value)}</span>
        <span class="lab-card-unit">${escHtml(unit)}</span>
      </div>
      ${barHtml}
      <div class="lab-card-footer">
        <span class="lab-card-date">${escHtml(dateStr)}</span>
        ${obs.overdue ? '<span class="lab-overdue-tag">Overdue</span>' : ''}
      </div>`;

    grid.appendChild(card);
  });
}

// ── Donut chart ────────────────────────────────────────────────────────────
function drawSummaryDonut(canvas, urgent, attention) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const cx = size / 2, cy = size / 2;
  const outerR = size * 0.44;
  const innerR = size * 0.28;
  const gap = 0.06;

  ctx.clearRect(0, 0, size, size);

  const total = urgent + attention;

  if (total === 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2, true);
    ctx.fillStyle = '#A7F3D0';
    ctx.fill();
    drawDonutText(ctx, cx, cy, size, '✓', '#059669');
    return;
  }

  let angle = -Math.PI / 2;

  if (urgent > 0) {
    const sweep = (urgent / total) * Math.PI * 2 - gap;
    drawArc(ctx, cx, cy, outerR, innerR, angle + gap / 2, angle + gap / 2 + sweep, '#DC2626');
    angle += (urgent / total) * Math.PI * 2;
  }

  if (attention > 0) {
    const sweep = (attention / total) * Math.PI * 2 - gap;
    drawArc(ctx, cx, cy, outerR, innerR, angle + gap / 2, angle + gap / 2 + sweep, '#D97706');
  }

  drawDonutText(ctx, cx, cy, size, String(total), '#111827');
}

function drawArc(ctx, cx, cy, outerR, innerR, start, end, color) {
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, start, end);
  ctx.arc(cx, cy, innerR, end, start, true);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function drawDonutText(ctx, cx, cy, size, text, color) {
  ctx.fillStyle = color;
  ctx.font = `bold ${size * 0.3}px -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy);
}

// ── Main analysis flow ─────────────────────────────────────────────────────
async function runAnalysis(patientKey) {
  hideError();
  results.classList.add('hidden');

  let apiKey;
  try {
    apiKey = await getApiKey();
  } catch {
    showError('No API key set. Click Settings to add your Anthropic API key.');
    return;
  }

  let bundle;
  try {
    const url = chrome.runtime.getURL(`patients/${patientKey}.json`);
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Cannot load ${patientKey}.json`);
    bundle = await resp.json();
  } catch (e) {
    showError(`Failed to load patient data: ${e.message}`);
    return;
  }

  const parsed = parseFHIR(bundle);
  currentParsed = parsed;
  currentPatientSummary = buildPatientSummaryText(parsed);
  headerPatName.textContent = `${parsed.fullName}, ${parsed.age}yo`;

  renderPatientInfo(parsed);
  askSection.style.display = '';

  // Show loading only for the Claude analysis section
  loading.classList.remove('hidden');

  let claudeResponse;
  try {
    claudeResponse = await callClaude(SYSTEM_PROMPT, currentPatientSummary, apiKey);
  } catch (e) {
    loading.classList.add('hidden');
    showError(`Claude API error: ${e.message}`);
    return;
  }

  let structured;
  try {
    const cleaned = claudeResponse.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    structured = JSON.parse(cleaned);
  } catch {
    loading.classList.add('hidden');
    showError('Could not parse Claude response. See console for details.');
    console.error('Raw Claude response:', claudeResponse);
    return;
  }

  loading.classList.add('hidden');
  renderResults(structured, parsed.observations.filter((o) => o.overdue).length);
}

// ── Render results ─────────────────────────────────────────────────────────
function renderResults({ flags = [], actions = [], medicationNote: medNote = '' }, overdueLabCount = 0) {
  const urgent = flags.filter((f) => f.severity === 'urgent').length;
  const attn   = flags.filter((f) => f.severity === 'attention').length;

  // Donut
  const canvas = document.getElementById('summary-donut');
  drawSummaryDonut(canvas, urgent, attn);
  document.getElementById('urgent-count').textContent = urgent;
  document.getElementById('attn-count').textContent   = attn;
  document.getElementById('overdue-labs-count').textContent = overdueLabCount;

  // Flags
  flagsContainer.innerHTML = '';
  if (flags.length === 0) {
    flagsContainer.innerHTML = '<p style="font-size:12px;color:#6B7280">No flags identified.</p>';
  } else {
    flags.forEach((flag) => renderFlagCard(flag));
  }

  // Actions
  actionsContainer.innerHTML = '';
  actionResult.classList.add('hidden');
  actions.forEach((action, i) => {
    const btn = document.createElement('button');
    btn.className = 'action-btn';
    btn.innerHTML = `
      <span class="action-btn-num">${i + 1}</span>
      <span class="action-btn-text">${escHtml(action.label)}</span>
      <span class="action-btn-arrow">›</span>`;
    btn.addEventListener('click', () => runActionPrompt(action.label, action.prompt));
    actionsContainer.appendChild(btn);
  });

  // Medication note
  document.getElementById('medication-note').innerHTML = simpleMarkdown(medNote || 'No medication concerns identified.');

  results.classList.remove('hidden');
}

// ── Flag card (compact, expandable) ───────────────────────────────────────
function renderFlagCard(flag) {
  const isUrgent = flag.severity === 'urgent';
  const text = flag.text;
  const LIMIT = 130;
  const short = text.length > LIMIT ? text.slice(0, LIMIT).trimEnd() + '…' : text;
  const needsExpand = text.length > LIMIT;

  const card = document.createElement('div');
  card.className = `flag-card ${isUrgent ? 'urgent' : 'attention'}`;

  card.innerHTML = `
    <div class="flag-header">
      <div class="flag-dot"></div>
      <span class="flag-badge">${isUrgent ? 'Urgent' : 'Attention'}</span>
    </div>
    <div class="flag-body">
      <span class="flag-text-short">${escHtml(short)}</span>
      <span class="flag-text-full" style="display:none">${escHtml(text)}</span>
      ${needsExpand ? '<button class="flag-toggle">Show more</button>' : ''}
    </div>`;

  if (needsExpand) {
    const btn = card.querySelector('.flag-toggle');
    const shortEl = card.querySelector('.flag-text-short');
    const fullEl  = card.querySelector('.flag-text-full');
    btn.addEventListener('click', () => {
      const expanded = fullEl.style.display !== 'none';
      shortEl.style.display = expanded ? '' : 'none';
      fullEl.style.display  = expanded ? 'none' : '';
      btn.textContent = expanded ? 'Show more' : 'Show less';
    });
  }

  flagsContainer.appendChild(card);
}

// ── Action prompt ──────────────────────────────────────────────────────────
async function runActionPrompt(label, prompt) {
  const apiKey = await getApiKey().catch(() => null);
  if (!apiKey) { showError('No API key set.'); return; }

  actionResult.classList.remove('hidden');
  actionResultLabel.textContent = label;
  actionResultContent.innerHTML = '';
  document.getElementById('action-mini-loading').classList.remove('hidden');

  try {
    const response = await callClaude(
      'You are a clinical assistant helping a Canadian family physician draft documents and plans. Be concise and clinically accurate. Use clear headings and bullet points.',
      `Patient context:\n${currentPatientSummary}\n\nTask: ${prompt}`,
      apiKey
    );
    document.getElementById('action-mini-loading').classList.add('hidden');
    actionResultContent.innerHTML = simpleMarkdown(response);
  } catch (e) {
    document.getElementById('action-mini-loading').classList.add('hidden');
    actionResultContent.textContent = `Error: ${e.message}`;
  }

  actionResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── Ask AI ─────────────────────────────────────────────────────────────────
async function handleAskAI() {
  const question = askInput.value.trim();
  if (!question || !currentPatientSummary) return;

  const apiKey = await getApiKey().catch(() => null);
  if (!apiKey) { showError('No API key set.'); return; }

  askResult.classList.remove('hidden');
  askResult.innerHTML = '<div class="md-content" style="color:#6B7280;font-style:italic">Thinking…</div>';
  askBtn.disabled = true;

  try {
    const response = await callClaude(
      'You are a clinical decision support assistant for a Canadian family physician. Answer questions about the patient concisely and accurately. Use bullet points where helpful.',
      `Patient context:\n${currentPatientSummary}\n\nPhysician question: ${question}`,
      apiKey
    );
    askResult.innerHTML = `<div class="md-content">${simpleMarkdown(response)}</div>`;
  } catch (e) {
    askResult.innerHTML = `<div class="md-content" style="color:#DC2626">Error: ${escHtml(e.message)}</div>`;
  } finally {
    askBtn.disabled = false;
  }
}

// ── Markdown renderer ──────────────────────────────────────────────────────
function simpleMarkdown(raw) {
  let s = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Bold / italic
  s = s.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
  s = s.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // Headings (##, ###, ####)
  s = s.replace(/^#{2,4} (.+)$/gm, '<div class="md-h">$1</div>');

  // Horizontal rules
  s = s.replace(/^---+$/gm, '<div class="md-hr"></div>');

  // List items (-, *, numbers, checkmarks)
  s = s.replace(/^(?:[-*✅✓•☐☒]|\d+\.) (.+)$/gm, '<div class="md-li">$1</div>');

  // Tables: skip complex rendering, just show as preformatted
  // (leave table rows as-is; they'll render as plain text in md-content font)

  // Paragraphs: blank lines → visual spacing
  s = s.replace(/\n{2,}/g, '<div class="md-p"></div>');
  s = s.replace(/\n/g, ' ');

  return s;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function callClaude(systemPrompt, userMessage, apiKey) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'CLAUDE_API_CALL', payload: { systemPrompt, userMessage, apiKey } },
      (response) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (response?.error)          return reject(new Error(response.error));
        resolve(response.content);
      }
    );
  });
}

function getApiKey() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['charted_api_key'], (result) => {
      result.charted_api_key ? resolve(result.charted_api_key) : reject(new Error('No API key'));
    });
  });
}

function showError(msg) {
  errorText.textContent = msg;
  errorBanner.classList.remove('hidden');
}

function hideError() { errorBanner.classList.add('hidden'); }

function resetToPickerView() {
  results.classList.add('hidden');
  loading.classList.add('hidden');
  patientInfo.classList.add('hidden');
  askSection.style.display = 'none';
  hideError();
  patientSelect.value = '';
  analyzeBtn.disabled = true;
  headerPatName.textContent = 'No patient selected';
  currentPatientSummary = null;
  currentParsed = null;
  askInput.value = '';
  askResult.classList.add('hidden');
  actionResult.classList.add('hidden');
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
