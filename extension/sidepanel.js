const API_BASE = 'http://localhost:8000/api';
const PREVIEW_COUNT = 3;
const STORY_PREVIEW_LENGTH = 180;

const $ = (id) => document.getElementById(id);

// ── Tab switching ─────────────────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => (p.style.display = 'none'));
    btn.classList.add('active');
    $(`panel-${btn.dataset.tab}`).style.display = 'block';
  });
});

// ── Analyze Page ──────────────────────────────────────────────────────────

$('analyzePageBtn').addEventListener('click', async () => {
  const btn = $('analyzePageBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="analyze-icon">&#9672;</span> Reading page...';
  $('results').style.display = 'none';
  $('error').style.display = 'none';

  try {
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'EXTRACT_PAGE' }, (resp) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else if (resp.error) reject(new Error(resp.error));
        else resolve(resp.data);
      });
    });

    if (!response.text || response.text.trim().length < 50) {
      throw new Error('Not enough text content found on this page.');
    }

    btn.innerHTML = '<span class="analyze-icon">&#9672;</span> Analyzing...';
    $('loading').style.display = 'block';

    const res = await fetch(`${API_BASE}/analyze-page`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page_text: response.text,
        page_title: response.title,
        page_url: response.url,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Server error: ${res.status}`);
    }

    const data = await res.json();
    renderResults(data, { id: 'page', name: data.summary.patient_name, birthDate: '-', gender: '-' });
  } catch (err) {
    $('error').textContent = `Error: ${err.message}`;
    $('error').style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="analyze-icon">&#9672;</span> Analyze This Page';
    $('loading').style.display = 'none';
  }
});

// ── Search ────────────────────────────────────────────────────────────────

$('searchForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const query = $('searchInput').value.trim();
  const btn = $('searchBtn');
  btn.disabled = true;
  btn.textContent = 'Searching...';
  $('searchResults').innerHTML = '';

  try {
    const params = new URLSearchParams({ count: '10' });
    if (query && /^\d+$/.test(query)) params.set('id', query);
    else if (query) params.set('name', query);
    const res = await fetch(`${API_BASE}/patients?${params}`);
    const data = await res.json();
    renderSearchResults(data.patients || []);
  } catch {
    $('searchResults').innerHTML = '<div class="no-results">Search failed. Is the backend running?</div>';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Search';
  }
});

function renderSearchResults(patients) {
  const container = $('searchResults');
  if (!patients.length) { container.innerHTML = '<div class="no-results">No patients found.</div>'; return; }
  let html = `<div class="search-result-count">${patients.length} patient(s) found</div>`;
  for (const p of patients) {
    html += `<button class="patient-btn" data-id="${p.id}" data-name="${p.name}" data-dob="${p.birthDate}" data-gender="${p.gender}">
      <div><div class="patient-btn-name">${p.name}</div><div class="patient-btn-meta">DOB: ${p.birthDate} | ${p.gender}</div></div>
      <span class="patient-btn-id">ID: ${p.id}</span></button>`;
  }
  container.innerHTML = html;
  container.querySelectorAll('.patient-btn').forEach(btn => {
    btn.addEventListener('click', () => runCopilot({ id: btn.dataset.id, name: btn.dataset.name, birthDate: btn.dataset.dob, gender: btn.dataset.gender }));
  });
}

// ── Copilot ───────────────────────────────────────────────────────────────

async function runCopilot(patient) {
  $('results').style.display = 'none';
  $('error').style.display = 'none';
  $('loading').style.display = 'block';
  try {
    const res = await fetch(`${API_BASE}/copilot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patient_id: patient.id }),
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || `Server error: ${res.status}`); }
    const data = await res.json();
    renderResults(data, patient);
  } catch (err) {
    $('error').textContent = `Error: ${err.message}`;
    $('error').style.display = 'block';
  } finally {
    $('loading').style.display = 'none';
  }
}

// ── Main render ───────────────────────────────────────────────────────────

function renderResults(data, patient) {
  const { summary, processing_time_seconds } = data;

  $('patientName').textContent = summary.patient_name;
  $('patientMeta').textContent = `${patient.birthDate} | ${patient.gender} | ID: ${patient.id}`;
  $('analysisTime').textContent = `${processing_time_seconds}s`;

  // Visit banner (above tabs, persists across both)
  const { visit_date, visit_reason } = summary;
  if (visit_date || visit_reason) {
    $('visitBanner').style.display = 'block';
    $('visitBannerDate').textContent = visit_date ? `📅 ${visit_date}` : '';
    const reason = visit_reason || '';
    const truncated = reason.length > 72 ? reason.slice(0, 69).replace(/\s\S*$/, '') + '…' : reason;
    $('visitBannerReason').textContent = truncated;
    $('visitBannerReason').title = reason; // full text on hover
  } else {
    $('visitBanner').style.display = 'none';
  }

  // Reset to "This Visit" tab
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => (p.style.display = 'none'));
  document.querySelector('[data-tab="thisVisit"]').classList.add('active');
  $('panel-thisVisit').style.display = 'block';

  renderThisVisitTab(summary);
  renderFullChartTab(summary);

  $('results').style.display = 'block';
}

// ── This Visit tab ────────────────────────────────────────────────────────

function renderThisVisitTab(summary) {
  const { visit_date, visit_reason, risks = [], actions = [], lab_trends = {}, conditions_timeline = [], changes = [], alerts = [], questions = [] } = summary;

  // Care gap alerts
  const alertsSection = $('alertsSection');
  const alertsList = $('alertsList');
  alertsList.innerHTML = '';
  if (alerts.length > 0) {
    alertsSection.style.display = 'block';
    for (const alert of alerts) {
      alertsList.appendChild(buildAlertChip(alert));
    }
  } else {
    alertsSection.style.display = 'none';
  }

  // Stat pills (clickable → switch to full chart tab)
  const statsEl = $('visitStats');
  statsEl.innerHTML = '';
  const statDefs = [
    { value: conditions_timeline.length || '—', label: 'Conditions', color: '#6366F1', bg: '#EEF2FF', tab: 'fullChart' },
    { value: risks.length, label: 'Risk Flags', color: '#EF4444', bg: '#FEF2F2', tab: 'fullChart' },
    { value: actions.length, label: 'Actions', color: '#10B981', bg: '#ECFDF5', tab: 'fullChart' },
    { value: changes.length, label: 'Changes', color: '#D97706', bg: '#FFFBEB', tab: 'fullChart' },
  ];
  for (const s of statDefs) {
    const pill = document.createElement('button');
    pill.className = 'stat-pill';
    pill.style.cssText = `background:${s.bg};border-top-color:${s.color};border-color:${s.color}20;`;
    pill.title = `View in Full Chart`;
    pill.innerHTML = `
      <div style="font-size:20px;font-weight:800;color:${s.color};line-height:1;letter-spacing:-0.05em">${s.value}</div>
      <div style="font-size:10px;color:#6B7280;font-weight:500;margin-top:2px">${s.label}</div>
    `;
    pill.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => (p.style.display = 'none'));
      document.querySelector(`[data-tab="${s.tab}"]`).classList.add('active');
      $(`panel-${s.tab}`).style.display = 'block';
    });
    statsEl.appendChild(pill);
  }

  // Visit-relevant risks (AI flag + rule-based fallback)
  const visitRisks = getVisitRisks(risks, visit_reason, visit_date);
  const visitRisksList = $('visitRisksList');
  visitRisksList.innerHTML = '';
  $('visitRisksEmpty').style.display = 'none';

  if (visitRisks.length === 0) {
    $('visitRisksEmpty').style.display = 'block';
  } else {
    for (const risk of visitRisks) {
      visitRisksList.appendChild(buildRiskCard(risk));
    }
  }

  // Questions to ask
  const questionsSection = $('questionsSection');
  const questionsList = $('questionsList');
  questionsList.innerHTML = '';
  if (questions.length > 0) {
    questionsSection.style.display = 'block';
    for (const q of questions) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="q-icon">?</span><span>${q}</span>`;
      questionsList.appendChild(li);
    }
  } else {
    questionsSection.style.display = 'none';
  }

  // Top 3 actions
  const visitActionsList = $('visitActionsList');
  visitActionsList.innerHTML = '';
  for (const action of actions.slice(0, 3)) {
    visitActionsList.appendChild(createActionItem(action));
  }
}

function getVisitRisks(risks, visitReason, visitDate) {
  // AI-tagged as relevant
  const aiRelevant = risks.filter(r => r.relevant_to_visit);

  // Rule-based: HIGH confidence risks are always surfaced, plus keyword match
  const keywords = visitReason
    ? visitReason.toLowerCase().split(/[\s,;:.]+/).filter(w => w.length > 4)
    : [];
  const ruleRelevant = risks.filter(r => {
    if (aiRelevant.includes(r)) return false;
    if (r.confidence === 'HIGH') return true;
    if (!keywords.length) return false;
    const text = ((r.issue || '') + ' ' + (r.evidence || '')).toLowerCase();
    return keywords.some(kw => text.includes(kw));
  });

  // Merge: AI first, then rule-based, deduplicated, max 4
  const merged = [...aiRelevant, ...ruleRelevant].slice(0, 4);
  // Fallback: just show top 3 risks if nothing matched
  return merged.length > 0 ? merged : risks.slice(0, 3);
}

// ── Full Chart tab ────────────────────────────────────────────────────────

function renderFullChartTab(summary) {
  const { lab_trends = {}, conditions_timeline = [], story, changes, risks, actions } = summary;

  // Lab accordion
  const labKeys = Object.keys(lab_trends).filter(k => lab_trends[k]?.length >= 1);
  const hasSys = labKeys.includes('Systolic BP');
  const hasDia = labKeys.includes('Diastolic BP');
  const hasBP = hasSys && hasDia;
  // Logical keys: replace Systolic+Diastolic with a single "BP" slot
  const logicalKeys = hasBP
    ? ['Blood Pressure', ...labKeys.filter(k => k !== 'Systolic BP' && k !== 'Diastolic BP')]
    : hasSys
    ? labKeys  // only systolic, show as-is
    : labKeys;

  if (labKeys.length > 0) {
    $('labAccordion').style.display = 'block';
    $('labAccordionCount').textContent = `(${logicalKeys.length})`;

    // Summary line: worst labs (treat BP as one)
    const isAbnormal = (k) => {
      if (k === 'Blood Pressure') {
        const s = lab_trends['Systolic BP'].at(-1);
        return s.refHigh && s.value > s.refHigh;
      }
      const pts = lab_trends[k];
      const latest = pts[pts.length - 1];
      return latest.refHigh && (latest.value > latest.refHigh || latest.value < (latest.refLow || 0));
    };
    const summaryLabel = (k) => {
      if (k === 'Blood Pressure') {
        const s = lab_trends['Systolic BP'].at(-1);
        const d = lab_trends['Diastolic BP'].at(-1);
        return `BP ${s.value}/${d.value}${isAbnormal(k) ? '⚠' : '✓'}`;
      }
      const pts = lab_trends[k];
      return `${k.split(' ')[0]} ${pts[pts.length - 1].value}${isAbnormal(k) ? '⚠' : '✓'}`;
    };
    const abnormalKeys = logicalKeys.filter(k => isAbnormal(k));
    const okKeys = logicalKeys.filter(k => !isAbnormal(k));
    const summaryParts = [...abnormalKeys.slice(0, 2), ...okKeys.slice(0, 1)].map(summaryLabel);
    $('labSummaryLine').textContent = summaryParts.join(' · ');

    // Build lab grid
    const labGrid = $('labGrid');
    labGrid.innerHTML = '';
    if (hasBP) labGrid.appendChild(buildBPCard(lab_trends['Systolic BP'], lab_trends['Diastolic BP']));
    for (const key of labKeys.filter(k => k !== 'Systolic BP' && k !== 'Diastolic BP')) {
      labGrid.appendChild(buildLabCard(key, lab_trends[key]));
    }

    $('labAccordionBtn').onclick = () => toggleAccordion('lab');
  }

  // Conditions accordion
  if (conditions_timeline.length > 0) {
    $('condAccordion').style.display = 'block';
    $('condAccordionCount').textContent = `(${conditions_timeline.length})`;
    $('condTimeline').innerHTML = '';
    $('condTimeline').appendChild(buildConditionsCard(conditions_timeline));
    $('condAccordionBtn').onclick = () => toggleAccordion('cond');
  }

  // Story
  renderStory(story);

  // Changes
  renderList('changes', changes, '~', 'amber');

  // All risks (full list with confidence cards)
  const risksList = $('risksList');
  const risksToggle = $('risksToggle');
  risksList.innerHTML = '';
  const visibleRisks = risks.slice(0, PREVIEW_COUNT);
  const hiddenRisks = risks.slice(PREVIEW_COUNT);
  for (const r of visibleRisks) risksList.appendChild(buildRiskCard(r));
  const hiddenRiskEls = [];
  for (const r of hiddenRisks) {
    const card = buildRiskCard(r);
    card.style.display = 'none';
    risksList.appendChild(card);
    hiddenRiskEls.push(card);
  }
  if (hiddenRisks.length > 0) {
    risksToggle.style.display = 'inline';
    risksToggle.textContent = `Show ${hiddenRisks.length} more`;
    let expanded = false;
    risksToggle.onclick = () => {
      expanded = !expanded;
      hiddenRiskEls.forEach(el => (el.style.display = expanded ? 'block' : 'none'));
      risksToggle.textContent = expanded ? 'Show less' : `Show ${hiddenRisks.length} more`;
    };
  } else {
    risksToggle.style.display = 'none';
  }

  // Actions
  renderActions(actions);

  // Counts
  $('changesCount').textContent = changes.length;
  $('risksCount').textContent = risks.length;
  $('actionsCount').textContent = actions.length;
}

function toggleAccordion(key) {
  const content = $(`${key}AccordionContent`);
  const chevron = $(`${key}Chevron`);
  const open = content.style.display === 'block';
  content.style.display = open ? 'none' : 'block';
  chevron.textContent = open ? '▼' : '▲';
}

// ── Risk cards ────────────────────────────────────────────────────────────

const RISK_CONF = {
  HIGH:   { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', dot: '🔴' },
  MEDIUM: { color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', dot: '🟡' },
  LOW:    { color: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB', dot: '⚪' },
};

function buildAlertChip(alert) {
  const isHigh = alert.urgency === 'HIGH';
  const chip = document.createElement('div');
  chip.className = 'alert-chip';
  chip.style.cssText = `border-left-color:${isHigh ? '#EF4444' : '#D97706'};background:${isHigh ? '#FEF2F2' : '#FFFBEB'};`;

  const hasDetail = alert.detail && alert.detail.trim();
  chip.innerHTML = `
    <div style="display:flex;align-items:flex-start;gap:8px">
      <span style="font-size:13px;flex-shrink:0">${isHigh ? '🔴' : '🟡'}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:600;color:#111827;line-height:1.3">${alert.message}</div>
        ${hasDetail ? `<div class="alert-detail">${alert.detail}</div>` : ''}
      </div>
      <span style="font-size:9px;font-weight:700;color:${isHigh ? '#EF4444' : '#D97706'};background:white;border:1px solid ${isHigh ? '#FECACA' : '#FDE68A'};border-radius:20px;padding:2px 6px;flex-shrink:0;letter-spacing:.04em">${isHigh ? 'URGENT' : 'DUE'}</span>
    </div>
  `;
  return chip;
}

function buildRiskCard(risk) {
  const wrapper = document.createElement('li');
  wrapper.style.cssText = 'list-style:none;padding:0;margin-bottom:6px;';

  if (typeof risk === 'string') {
    wrapper.innerHTML = `<div style="padding:6px 0;font-size:12px;color:#374151;display:flex;gap:6px;border-bottom:1px solid #F3F4F6"><span style="color:#DC2626;font-weight:700">!</span><span>${risk}</span></div>`;
    return wrapper;
  }

  const { issue = '', confidence = 'MEDIUM', evidence = '' } = risk;
  const meta = RISK_CONF[confidence.toUpperCase()] || RISK_CONF.MEDIUM;

  const card = document.createElement('div');
  card.style.cssText = `background:${meta.bg};border:1px solid ${meta.border};border-left:3px solid ${meta.color};border-radius:7px;padding:9px 11px;`;

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:flex-start;justify-content:space-between;gap:6px;';
  header.innerHTML = `
    <div style="font-size:12px;font-weight:600;color:#111827;line-height:1.4;flex:1">${meta.dot} ${issue}</div>
    <span style="flex-shrink:0;font-size:9px;font-weight:700;color:${meta.color};background:white;border:1px solid ${meta.border};border-radius:20px;padding:2px 6px;letter-spacing:.04em">${confidence.toUpperCase()}</span>
  `;
  card.appendChild(header);

  if (evidence) {
    const evToggle = document.createElement('button');
    evToggle.style.cssText = `margin-top:5px;font-size:10px;color:${meta.color};background:none;border:none;cursor:pointer;padding:0;font-family:inherit;font-weight:600;`;
    evToggle.textContent = 'Why? ›';
    const evText = document.createElement('div');
    evText.style.cssText = 'font-size:11px;color:#6B7280;margin-top:5px;line-height:1.5;display:none;';
    evText.innerHTML = `<span style="font-size:9px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.06em">Evidence: </span>${evidence}`;
    let open = false;
    evToggle.onclick = () => {
      open = !open;
      evText.style.display = open ? 'block' : 'none';
      evToggle.textContent = open ? 'Hide ‹' : 'Why? ›';
    };
    card.appendChild(evToggle);
    card.appendChild(evText);
  }

  wrapper.appendChild(card);
  return wrapper;
}

// ── Render helpers ────────────────────────────────────────────────────────

function renderStory(story) {
  const bulletsEl = $('storyBullets');
  bulletsEl.innerHTML = '';
  // Parse "• ..." lines; fall back to splitting prose into 3 chunks
  const lines = story.split('\n').map(l => l.trim()).filter(l => l.startsWith('•') || l.startsWith('-'));
  const bullets = lines.length >= 2
    ? lines.map(l => l.replace(/^[•\-]\s*/, '').trim())
    : story.split(/\.\s+/).filter(s => s.trim().length > 10).slice(0, 3).map(s => s.trim().replace(/\.$/, ''));
  for (const b of bullets) {
    const li = document.createElement('li');
    li.textContent = b;
    bulletsEl.appendChild(li);
  }
}

function renderList(key, items, icon, color) {
  const list = $(`${key}List`);
  const toggle = $(`${key}Toggle`);
  list.innerHTML = '';
  const visible = items.slice(0, PREVIEW_COUNT);
  const hidden = items.slice(PREVIEW_COUNT);
  for (const item of visible) list.appendChild(createListItem(item, icon, color));
  const hiddenEls = [];
  for (const item of hidden) {
    const li = createListItem(item, icon, color);
    li.style.display = 'none';
    list.appendChild(li);
    hiddenEls.push(li);
  }
  if (hidden.length > 0) {
    toggle.style.display = 'inline';
    toggle.textContent = `Show ${hidden.length} more`;
    let expanded = false;
    toggle.onclick = () => {
      expanded = !expanded;
      hiddenEls.forEach(el => (el.style.display = expanded ? 'flex' : 'none'));
      toggle.textContent = expanded ? 'Show less' : `Show ${hidden.length} more`;
    };
  } else {
    toggle.style.display = 'none';
  }
}

function renderActions(items) {
  const list = $('actionsList');
  const toggle = $('actionsToggle');
  list.innerHTML = '';
  const visible = items.slice(0, PREVIEW_COUNT);
  const hidden = items.slice(PREVIEW_COUNT);
  for (const item of visible) list.appendChild(createActionItem(item));
  const hiddenEls = [];
  for (const item of hidden) {
    const li = createActionItem(item);
    li.style.display = 'none';
    list.appendChild(li);
    hiddenEls.push(li);
  }
  if (hidden.length > 0) {
    toggle.style.display = 'inline';
    toggle.textContent = `Show ${hidden.length} more`;
    let expanded = false;
    toggle.onclick = () => {
      expanded = !expanded;
      hiddenEls.forEach(el => (el.style.display = expanded ? 'flex' : 'none'));
      toggle.textContent = expanded ? 'Show less' : `Show ${hidden.length} more`;
    };
  } else {
    toggle.style.display = 'none';
  }
}

function createListItem(text, icon, color) {
  const li = document.createElement('li');
  li.innerHTML = `<span class="item-icon ${color}">${icon}</span><span>${text}</span>`;
  return li;
}

function createActionItem(text) {
  const li = document.createElement('li');
  li.innerHTML = `<input type="checkbox" class="item-checkbox" /><span>${text}</span>`;
  return li;
}

// ── Lab charts (Canvas) ───────────────────────────────────────────────────

const LAB_COLORS = {
  'HbA1c': '#3B82F6', 'Systolic BP': '#EF4444', 'Diastolic BP': '#F97316',
  'eGFR': '#8B5CF6', 'Total Cholesterol': '#F59E0B', 'LDL': '#EC4899',
  'HDL': '#10B981', 'Glucose': '#6366F1', 'Weight (kg)': '#14B8A6',
  'BMI': '#84CC16', 'Creatinine': '#A855F7', 'TSH': '#0EA5E9',
  'Potassium': '#D97706', 'Triglycerides': '#64748B',
};

function buildBPCard(sysPoints, diaPoints) {
  const color = '#EF4444';
  const sLatest = sysPoints[sysPoints.length - 1];
  const dLatest = diaPoints[diaPoints.length - 1];
  const sPrev = sysPoints.length > 1 ? sysPoints[sysPoints.length - 2] : null;
  const dPrev = diaPoints.length > 1 ? diaPoints[diaPoints.length - 2] : null;
  const sTrend = sPrev ? +(sLatest.value - sPrev.value).toFixed(0) : null;
  const dTrend = dPrev ? +(dLatest.value - dPrev.value).toFixed(0) : null;
  const sAbnormal = sLatest.refHigh && sLatest.value > sLatest.refHigh;
  const dAbnormal = dLatest.refHigh && dLatest.value > dLatest.refHigh;
  const isAbnormal = sAbnormal || dAbnormal;

  const trendStr = (trend) => trend !== null
    ? `<span style="font-size:9px;font-weight:600;color:${trend > 0 ? '#EF4444' : trend < 0 ? '#10B981' : '#9CA3AF'}">${trend > 0 ? '▲' : trend < 0 ? '▼' : '—'}${Math.abs(trend)}</span>`
    : '';

  const card = document.createElement('div');
  card.className = 'lab-card';
  card.style.cssText = `background:#FAFAFA;border-top-color:${color};border-left:1px solid ${color}25;border-right:1px solid ${color}25;border-bottom:1px solid ${color}25;box-shadow:0 2px 8px ${color}12;`;

  card.innerHTML = `
    <div style="font-size:9px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:0.06em;margin-bottom:3px">Blood Pressure</div>
    <div style="display:flex;align-items:baseline;gap:2px;flex-wrap:wrap">
      <span style="font-size:21px;font-weight:800;color:${isAbnormal ? '#EF4444' : '#111827'};line-height:1;letter-spacing:-0.05em">${sLatest.value}/${dLatest.value}</span>
      <span style="font-size:9px;color:#9CA3AF">mmHg</span>
      ${trendStr(sTrend)}
    </div>
    <div style="font-size:9px;color:#9CA3AF;margin-top:2px">
      Sys ${sLatest.value} ${trendStr(sTrend)} &nbsp;·&nbsp; Dia ${dLatest.value} ${trendStr(dTrend)}
    </div>
    ${isAbnormal ? '<div style="font-size:8px;font-weight:700;color:#EF4444;text-transform:uppercase;margin-top:2px;letter-spacing:0.05em">Out of range</div>' : ''}
    <div style="font-size:8px;color:#9CA3AF;margin-top:4px">${sysPoints.length} readings · target &lt;130/80</div>
  `;

  // Draw sys line chart if enough data
  if (sysPoints.length > 1) {
    const canvas = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = 140 * dpr;
    canvas.height = 56 * dpr;
    canvas.style.cssText = 'width:100%;height:56px;display:block;margin-top:5px;';
    card.appendChild(canvas);
    requestAnimationFrame(() => drawBPChart(canvas, sysPoints, diaPoints, dpr));
  }

  return card;
}

function drawBPChart(canvas, sysPoints, diaPoints, dpr) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const PAD = { top: 6 * dpr, right: 10 * dpr, bottom: 18 * dpr, left: 10 * dpr };
  const innerW = W - PAD.left - PAD.right, innerH = H - PAD.top - PAD.bottom;
  const allVals = [...sysPoints, ...diaPoints].map(p => p.value);
  const vMin = Math.min(...allVals) * 0.9;
  const vMax = Math.max(...allVals) * 1.1;
  const vRange = vMax - vMin;
  const toX = i => PAD.left + (sysPoints.length > 1 ? (i / (sysPoints.length - 1)) * innerW : innerW / 2);
  const toY = v => PAD.top + (1 - (v - vMin) / vRange) * innerH;

  ctx.clearRect(0, 0, W, H);

  // Target band (sys <130, dia <80)
  ctx.fillStyle = '#EF444415';
  ctx.fillRect(PAD.left, toY(130), innerW, toY(80) - toY(130));

  const drawLine = (points, color) => {
    ctx.strokeStyle = color; ctx.lineWidth = 2 * dpr; ctx.lineJoin = 'round';
    ctx.beginPath();
    points.forEach((p, i) => i === 0 ? ctx.moveTo(toX(i), toY(p.value)) : ctx.lineTo(toX(i), toY(p.value)));
    ctx.stroke();
    points.forEach((p, i) => {
      const isLast = i === points.length - 1;
      ctx.fillStyle = (p.refHigh && p.value > p.refHigh) ? '#EF4444' : color;
      ctx.beginPath(); ctx.arc(toX(i), toY(p.value), (isLast ? 4 : 2.5) * dpr, 0, Math.PI * 2); ctx.fill();
      if (isLast) { ctx.strokeStyle = 'white'; ctx.lineWidth = 1.5 * dpr; ctx.stroke(); }
    });
  };

  drawLine(sysPoints, '#EF4444');
  drawLine(diaPoints, '#F97316');

  ctx.fillStyle = '#9CA3AF'; ctx.font = `${7 * dpr}px Inter, sans-serif`;
  ctx.textAlign = 'left'; ctx.fillText(sysPoints[0].date.slice(0, 7), PAD.left, H - 3 * dpr);
  ctx.textAlign = 'right'; ctx.fillText(sysPoints[sysPoints.length - 1].date.slice(0, 7), W - PAD.right, H - 3 * dpr);
}

function buildLabCard(label, points) {
  const color = LAB_COLORS[label] || '#6B7280';
  const latest = points[points.length - 1];
  const prev = points.length > 1 ? points[points.length - 2] : null;
  const refLow = latest.refLow ?? points[0].refLow;
  const refHigh = latest.refHigh ?? points[0].refHigh;
  const hasRef = refLow != null && refHigh != null;
  const isAbnormal = hasRef && (latest.value < refLow || latest.value > refHigh);
  const trend = prev ? +(latest.value - prev.value).toFixed(1) : null;

  const card = document.createElement('div');
  card.className = 'lab-card';
  card.style.cssText = `background:#FAFAFA;border-top-color:${color};border-left:1px solid ${color}25;border-right:1px solid ${color}25;border-bottom:1px solid ${color}25;box-shadow:0 2px 8px ${color}12;`;

  const trendHTML = trend !== null
    ? `<span style="font-size:10px;font-weight:600;color:${trend > 0 ? '#EF4444' : trend < 0 ? '#10B981' : '#9CA3AF'};margin-left:3px">${trend > 0 ? '▲' : trend < 0 ? '▼' : '—'}${Math.abs(trend)}</span>`
    : '';

  card.innerHTML = `
    <div style="font-size:9px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:0.06em;margin-bottom:3px">${label}</div>
    <div style="display:flex;align-items:baseline;flex-wrap:wrap;gap:2px">
      <span style="font-size:21px;font-weight:800;color:${isAbnormal ? '#EF4444' : '#111827'};line-height:1;letter-spacing:-0.05em">${latest.value}</span>
      <span style="font-size:9px;color:#9CA3AF">${latest.unit || ''}</span>
      ${trendHTML}
    </div>
    ${isAbnormal ? '<div style="font-size:8px;font-weight:700;color:#EF4444;text-transform:uppercase;margin-top:2px;letter-spacing:0.05em">Out of range</div>' : ''}
  `;

  if (points.length > 1) {
    const canvas = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = 140 * dpr;
    canvas.height = 56 * dpr;
    canvas.style.cssText = 'width:100%;height:56px;display:block;margin-top:5px;';
    card.appendChild(canvas);
    requestAnimationFrame(() => drawLineChart(canvas, points, color, dpr));
  } else if (hasRef) {
    card.insertAdjacentHTML('beforeend', `<div style="font-size:8px;color:#9CA3AF;margin-top:5px">Ref: ${refLow}–${refHigh} ${latest.unit || ''}</div>`);
  }

  card.insertAdjacentHTML('beforeend', `<div style="font-size:8px;color:#9CA3AF;margin-top:4px">${points.length} reading${points.length !== 1 ? 's' : ''}${hasRef ? ` · target ${refLow}–${refHigh}` : ''}</div>`);
  return card;
}

function drawLineChart(canvas, points, color, dpr) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const PAD = { top: 6 * dpr, right: 10 * dpr, bottom: 18 * dpr, left: 10 * dpr };
  const innerW = W - PAD.left - PAD.right, innerH = H - PAD.top - PAD.bottom;
  const values = points.map(p => p.value);
  const refLow = points[0].refLow, refHigh = points[0].refHigh;
  let vMin, vMax;
  if (refLow != null) {
    vMin = Math.min(...values, refLow) * 0.88;
    vMax = Math.max(...values, refHigh) * 1.12;
  } else {
    const range = Math.max(...values) - Math.min(...values) || Math.min(...values) * 0.1 || 1;
    vMin = Math.min(...values) - range * 0.25;
    vMax = Math.max(...values) + range * 0.25;
  }
  const vRange = vMax - vMin;
  const toX = i => PAD.left + (points.length > 1 ? (i / (points.length - 1)) * innerW : innerW / 2);
  const toY = v => PAD.top + (1 - (v - vMin) / vRange) * innerH;
  ctx.clearRect(0, 0, W, H);
  if (refLow != null) {
    ctx.fillStyle = color + '20';
    ctx.fillRect(PAD.left, toY(refHigh), innerW, toY(refLow) - toY(refHigh));
    ctx.strokeStyle = color + '60'; ctx.lineWidth = 0.8 * dpr;
    ctx.setLineDash([3 * dpr, 3 * dpr]);
    [refHigh, refLow].forEach(v => { if (v > vMin) { ctx.beginPath(); ctx.moveTo(PAD.left, toY(v)); ctx.lineTo(W - PAD.right, toY(v)); ctx.stroke(); } });
    ctx.setLineDash([]);
  }
  ctx.strokeStyle = color; ctx.lineWidth = 2 * dpr; ctx.lineJoin = 'round';
  ctx.beginPath();
  points.forEach((p, i) => i === 0 ? ctx.moveTo(toX(i), toY(p.value)) : ctx.lineTo(toX(i), toY(p.value)));
  ctx.stroke();
  points.forEach((p, i) => {
    const isLast = i === points.length - 1;
    const isOut = refLow != null && (p.value < refLow || p.value > refHigh);
    ctx.fillStyle = isOut ? '#EF4444' : color;
    ctx.beginPath(); ctx.arc(toX(i), toY(p.value), (isLast ? 4 : 2.5) * dpr, 0, Math.PI * 2); ctx.fill();
    if (isLast) { ctx.strokeStyle = 'white'; ctx.lineWidth = 1.5 * dpr; ctx.stroke(); }
  });
  ctx.fillStyle = '#9CA3AF'; ctx.font = `${7 * dpr}px Inter, sans-serif`;
  ctx.textAlign = 'left'; ctx.fillText(points[0].date.slice(0, 7), PAD.left, H - 3 * dpr);
  if (points.length > 1) { ctx.textAlign = 'right'; ctx.fillText(points[points.length - 1].date.slice(0, 7), W - PAD.right, H - 3 * dpr); }
}

// ── Conditions timeline ────────────────────────────────────────────────────

const COND_COLORS = ['#3B82F6','#EF4444','#10B981','#F59E0B','#8B5CF6','#EC4899','#14B8A6','#F97316'];

function buildConditionsCard(conditions) {
  const sorted = [...conditions].sort((a, b) => a.onset.localeCompare(b.onset));
  const minYear = parseInt(sorted[0].onset);
  const maxYear = new Date().getFullYear();
  const span = maxYear - minYear || 1;
  const card = document.createElement('div');
  card.className = 'cond-card';
  const timeline = document.createElement('div'); timeline.className = 'cond-timeline';
  const line = document.createElement('div'); line.className = 'cond-timeline-line';
  timeline.appendChild(line);
  sorted.forEach((c, i) => {
    const pct = Math.max(1, Math.min(97, ((parseInt(c.onset) - minYear) / span) * 100));
    const dot = document.createElement('div');
    dot.className = 'cond-dot';
    dot.title = `${c.name} — ${c.onset.slice(0, 4)}`;
    dot.style.cssText = `left:${pct}%;background:${COND_COLORS[i % COND_COLORS.length]};box-shadow:0 0 0 2px ${COND_COLORS[i % COND_COLORS.length]}60;`;
    timeline.appendChild(dot);
  });
  card.appendChild(timeline);
  const years = document.createElement('div'); years.className = 'cond-years';
  years.innerHTML = `<span>${minYear}</span><span>${maxYear}</span>`;
  card.appendChild(years);
  const chips = document.createElement('div'); chips.className = 'cond-chips';
  sorted.forEach((c, i) => {
    const chip = document.createElement('div'); chip.className = 'cond-chip';
    chip.style.cssText = `border:1px solid ${COND_COLORS[i % COND_COLORS.length]}40;`;
    chip.innerHTML = `<div style="width:6px;height:6px;border-radius:50%;background:${COND_COLORS[i % COND_COLORS.length]};flex-shrink:0;"></div><span style="font-size:11px;color:#374151;font-weight:500">${c.name}</span><span style="font-size:9px;color:#9CA3AF">${c.onset.slice(0, 4)}</span>`;
    chips.appendChild(chip);
  });
  card.appendChild(chips);
  return card;
}
