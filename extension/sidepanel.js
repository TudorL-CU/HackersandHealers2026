const API_BASE = 'http://localhost:8000/api';
const PREVIEW_COUNT = 3;
const STORY_PREVIEW_LENGTH = 180;

const $ = (id) => document.getElementById(id);

let currentPatientId = null;
let currentPageText = null;

// --- Analyze Page ---

$('analyzePageBtn').addEventListener('click', async () => {
  const btn = $('analyzePageBtn');
  btn.disabled = true;
  btn.textContent = 'Reading...';
  $('results').style.display = 'none';
  $('error').style.display = 'none';

  try {
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'EXTRACT_PAGE' }, (resp) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (resp.error) {
          reject(new Error(resp.error));
        } else {
          resolve(resp.data);
        }
      });
    });

    if (!response.text || response.text.trim().length < 50) {
      throw new Error('Not enough text content found on this page. Open a patient document and try again.');
    }

    btn.textContent = 'Analyzing...';
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
    currentPatientId = null;
    currentPageText = response.text;
    renderResults(data, {
      id: 'page',
      name: data.summary.patient_name,
      birthDate: '-',
      gender: '-',
    });
  } catch (err) {
    $('error').textContent = `Error: ${err.message}`;
    $('error').style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Analyze Patient';
    $('loading').style.display = 'none';
  }
});


// --- Copilot ---

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

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Server error: ${res.status}`);
    }

    const data = await res.json();
    currentPatientId = patient.id;
    currentPageText = null;
    renderResults(data, patient);
  } catch (err) {
    $('error').textContent = `Error: ${err.message}`;
    $('error').style.display = 'block';
  } finally {
    $('loading').style.display = 'none';
  }
}

// --- Render ---

function renderResults(data, patient) {
  const { summary, processing_time_seconds } = data;

  $('patientName').textContent = summary.patient_name;
  const metaParts = [patient.birthDate, patient.gender].filter(v => v && v !== '-');
  $('patientMeta').textContent = metaParts.length > 0 ? metaParts.join(' | ') : '';
  $('analysisTime').textContent = `${processing_time_seconds}s`;

  // Charts & widgets
  renderCharts(summary);

  // Story
  renderStory(summary.story);

  // Changes
  renderList('changes', summary.changes, '~', 'amber');

  // Risks
  renderList('risks', summary.risks, '!', 'red');

  // Actions
  renderActions(summary.actions);

  // Counts
  $('changesCount').textContent = summary.changes.length;
  $('risksCount').textContent = summary.risks.length;
  $('actionsCount').textContent = summary.actions.length;

  $('results').style.display = 'block';
}

// ── Charts ────────────────────────────────────────────────────────────────

const LAB_COLORS = {
  'HbA1c': '#3B82F6',
  'Systolic BP': '#EF4444',
  'Diastolic BP': '#F97316',
  'eGFR': '#8B5CF6',
  'Total Cholesterol': '#F59E0B',
  'LDL': '#EC4899',
  'HDL': '#10B981',
  'Glucose': '#6366F1',
  'Weight (kg)': '#14B8A6',
  'BMI': '#84CC16',
  'Creatinine': '#A855F7',
  'TSH': '#0EA5E9',
  'Potassium': '#D97706',
  'Triglycerides': '#64748B',
};

const COND_COLORS = ['#3B82F6','#EF4444','#10B981','#F59E0B','#8B5CF6','#EC4899','#14B8A6','#F97316'];

function renderCharts(summary) {
  const {
    lab_trends = {},
    conditions_timeline = [],
    risks = [],
    actions = [],
    changes = [],
  } = summary;

  const section = $('chartsSection');
  section.innerHTML = '';

  const labKeys = Object.keys(lab_trends).filter(k => lab_trends[k] && lab_trends[k].length >= 1);
  const hasLabs = labKeys.length > 0;
  const hasConds = conditions_timeline.length > 0;

  if (!hasLabs && !hasConds) {
    section.style.display = 'none';
    return;
  }


  // ── Conditions timeline ─────────────────────────────────────────────────
  if (hasConds) {
    const lbl = document.createElement('div');
    lbl.className = 'charts-section-label';
    lbl.textContent = 'Conditions Timeline';
    section.appendChild(lbl);
    section.appendChild(buildConditionsCard(conditions_timeline));
  }

  // ── Lab charts ──────────────────────────────────────────────────────────
  if (hasLabs) {
    const lbl = document.createElement('div');
    lbl.className = 'charts-section-label';
    lbl.textContent = 'Lab Trends';
    section.appendChild(lbl);

    const labGrid = document.createElement('div');
    labGrid.className = 'lab-grid';
    for (const key of labKeys) {
      labGrid.appendChild(buildLabCard(key, lab_trends[key]));
    }
    section.appendChild(labGrid);
  }

  section.style.display = 'block';
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
    card.insertAdjacentHTML('beforeend',
      `<div style="font-size:8px;color:#9CA3AF;margin-top:5px">Ref: ${refLow}–${refHigh} ${latest.unit || ''}</div>`);
  }

  card.insertAdjacentHTML('beforeend',
    `<div style="font-size:8px;color:#9CA3AF;margin-top:4px">${points.length} reading${points.length !== 1 ? 's' : ''}${hasRef ? ` · target ${refLow}–${refHigh}` : ''}</div>`);

  return card;
}

function drawLineChart(canvas, points, color, dpr) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const PAD = { top: 6 * dpr, right: 10 * dpr, bottom: 18 * dpr, left: 10 * dpr };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const values = points.map(p => p.value);
  const refLow = points[0].refLow;
  const refHigh = points[0].refHigh;

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

  const toX = (i) => PAD.left + (points.length > 1 ? (i / (points.length - 1)) * innerW : innerW / 2);
  const toY = (v) => PAD.top + (1 - (v - vMin) / vRange) * innerH;

  ctx.clearRect(0, 0, W, H);

  // Reference zone
  if (refLow != null) {
    ctx.fillStyle = color + '20';
    ctx.fillRect(PAD.left, toY(refHigh), innerW, toY(refLow) - toY(refHigh));
    ctx.strokeStyle = color + '60';
    ctx.lineWidth = 0.8 * dpr;
    ctx.setLineDash([3 * dpr, 3 * dpr]);
    [refHigh, refLow].forEach(v => {
      if (v > vMin) {
        ctx.beginPath();
        ctx.moveTo(PAD.left, toY(v));
        ctx.lineTo(W - PAD.right, toY(v));
        ctx.stroke();
      }
    });
    ctx.setLineDash([]);
  }

  // Line
  ctx.strokeStyle = color;
  ctx.lineWidth = 2 * dpr;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  points.forEach((p, i) => {
    i === 0 ? ctx.moveTo(toX(i), toY(p.value)) : ctx.lineTo(toX(i), toY(p.value));
  });
  ctx.stroke();

  // Dots
  points.forEach((p, i) => {
    const isLast = i === points.length - 1;
    const isOut = refLow != null && (p.value < refLow || p.value > refHigh);
    ctx.fillStyle = isOut ? '#EF4444' : color;
    ctx.beginPath();
    ctx.arc(toX(i), toY(p.value), (isLast ? 4 : 2.5) * dpr, 0, Math.PI * 2);
    ctx.fill();
    if (isLast) {
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 1.5 * dpr;
      ctx.stroke();
    }
  });

  // Date labels
  ctx.fillStyle = '#9CA3AF';
  ctx.font = `${7 * dpr}px Inter, sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText(points[0].date.slice(0, 7), PAD.left, H - 3 * dpr);
  if (points.length > 1) {
    ctx.textAlign = 'right';
    ctx.fillText(points[points.length - 1].date.slice(0, 7), W - PAD.right, H - 3 * dpr);
  }
}

function buildConditionsCard(conditions) {
  const sorted = [...conditions].sort((a, b) => a.onset.localeCompare(b.onset));
  const minYear = parseInt(sorted[0].onset);
  const maxYear = new Date().getFullYear();
  const span = maxYear - minYear || 1;

  const card = document.createElement('div');
  card.className = 'cond-card';

  // Timeline
  const timeline = document.createElement('div');
  timeline.className = 'cond-timeline';

  const line = document.createElement('div');
  line.className = 'cond-timeline-line';
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

  // Year axis
  const years = document.createElement('div');
  years.className = 'cond-years';
  years.innerHTML = `<span>${minYear}</span><span>${maxYear}</span>`;
  card.appendChild(years);

  // Chips
  const chips = document.createElement('div');
  chips.className = 'cond-chips';
  sorted.forEach((c, i) => {
    const chip = document.createElement('button');
    chip.className = 'cond-chip';
    chip.style.cssText = `border:1px solid ${COND_COLORS[i % COND_COLORS.length]}40;`;
    chip.innerHTML = `
      <div style="width:6px;height:6px;border-radius:50%;background:${COND_COLORS[i % COND_COLORS.length]};flex-shrink:0;"></div>
      <span style="font-size:11px;color:#374151;font-weight:500">${c.name}</span>
      <span style="font-size:9px;color:#9CA3AF">${c.onset.slice(0, 4)}</span>
    `;
    chip.addEventListener('click', () => showConditionDetail(c.name));
    chips.appendChild(chip);
  });
  card.appendChild(chips);

  return card;
}

function renderStory(story) {
  const needsTruncate = story.length > STORY_PREVIEW_LENGTH;
  const preview = needsTruncate
    ? story.slice(0, STORY_PREVIEW_LENGTH).replace(/\s+\S*$/, '') + '...'
    : story;

  $('storyPreview').textContent = preview;
  $('storyFull').textContent = story;

  const toggle = $('storyToggle');
  if (needsTruncate) {
    toggle.style.display = 'inline';
    toggle.textContent = 'Read more';
    let expanded = false;
    toggle.onclick = () => {
      expanded = !expanded;
      $('storyPreview').style.display = expanded ? 'none' : 'block';
      $('storyFull').style.display = expanded ? 'block' : 'none';
      toggle.textContent = expanded ? 'Show less' : 'Read more';
    };
  } else {
    toggle.style.display = 'none';
  }
  $('storyPreview').style.display = 'block';
  $('storyFull').style.display = 'none';
}

function renderList(key, items, icon, color) {
  const list = $(`${key}List`);
  const toggle = $(`${key}Toggle`);
  list.innerHTML = '';

  const visible = items.slice(0, PREVIEW_COUNT);
  const hidden = items.slice(PREVIEW_COUNT);

  for (const item of visible) {
    list.appendChild(createListItem(item, icon, color));
  }

  if (hidden.length > 0) {
    const hiddenEls = [];
    for (const item of hidden) {
      const li = createListItem(item, icon, color);
      li.style.display = 'none';
      li.classList.add(`${key}-hidden`);
      list.appendChild(li);
      hiddenEls.push(li);
    }

    toggle.style.display = 'inline';
    toggle.textContent = `Show ${hidden.length} more`;
    let expanded = false;
    toggle.onclick = () => {
      expanded = !expanded;
      hiddenEls.forEach((el) => (el.style.display = expanded ? 'flex' : 'none'));
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

  for (const item of visible) {
    list.appendChild(createActionItem(item));
  }

  if (hidden.length > 0) {
    const hiddenEls = [];
    for (const item of hidden) {
      const li = createActionItem(item);
      li.style.display = 'none';
      li.classList.add('actions-hidden');
      list.appendChild(li);
      hiddenEls.push(li);
    }

    toggle.style.display = 'inline';
    toggle.textContent = `Show ${hidden.length} more`;
    let expanded = false;
    toggle.onclick = () => {
      expanded = !expanded;
      hiddenEls.forEach((el) => (el.style.display = expanded ? 'flex' : 'none'));
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

// --- Condition Detail ---

const STATUS_COLORS = {
  improving: '#10B981',
  stable: '#3B82F6',
  worsening: '#EF4444',
  new_finding: '#F59E0B',
};
const STATUS_LABELS = {
  improving: 'Improving',
  stable: 'Stable',
  worsening: 'Worsening',
  new_finding: 'New Finding',
};

async function showConditionDetail(conditionName) {
  $('results').style.display = 'none';
  $('conditionDetail').style.display = 'block';
  $('conditionHeader').innerHTML = `
    <div style="padding:14px 16px;display:flex;align-items:center;gap:10px;background:white;border-radius:10px 10px 0 0;margin-top:12px;border-bottom:1px solid #E5E7EB">
      <button id="conditionBackBtnInner" style="background:none;border:none;font-size:18px;cursor:pointer;color:#6366F1;padding:0;line-height:1">←</button>
      <div style="flex:1">
        <div style="font-size:15px;font-weight:700;color:#111827">${conditionName}</div>
      </div>
    </div>
  `;
  $('conditionBackBtnInner').addEventListener('click', () => {
    $('conditionDetail').style.display = 'none';
    $('results').style.display = 'block';
  });
  $('conditionLoading').style.display = 'block';
  $('conditionContent').innerHTML = '';

  try {
    const body = { condition_name: conditionName };
    if (currentPatientId) body.patient_id = currentPatientId;
    else if (currentPageText) body.page_text = currentPageText;

    const res = await fetch(`${API_BASE}/condition-detail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Error ${res.status}`);
    }

    const data = await res.json();
    renderConditionDetail(data);
  } catch (err) {
    $('conditionContent').innerHTML = `<div style="padding:14px 16px;color:#b91c1c;font-size:13px">Error: ${err.message}</div>`;
  } finally {
    $('conditionLoading').style.display = 'none';
  }
}

function renderConditionDetail(data) {
  const container = $('conditionContent');
  container.innerHTML = '';

  // Status banner — the most important thing, big and clear
  if (data.current_status) {
    const statusEl = document.createElement('div');
    statusEl.style.cssText = `
      margin: 0; padding: 14px 16px;
      background: linear-gradient(135deg, #EEF2FF, #F0F4FF);
      border-bottom: 1px solid #C7D2FE;
      display: flex; align-items: center; gap: 10px;
    `;
    statusEl.innerHTML = `
      <div style="width:10px;height:10px;border-radius:50%;background:#6366F1;flex-shrink:0"></div>
      <div style="font-size:14px;font-weight:600;color:#1E40AF">${data.current_status}</div>
    `;
    container.appendChild(statusEl);
  }

  // Summary — one line, subtle
  if (data.condition_summary) {
    const summaryEl = document.createElement('div');
    summaryEl.style.cssText = 'padding:10px 16px;font-size:12px;color:#6B7280;line-height:1.6;background:white;border-bottom:1px solid #F3F4F6';
    summaryEl.textContent = data.condition_summary;
    container.appendChild(summaryEl);
  }

  // Care gaps — red alert cards
  const gaps = data.gaps_in_care || [];
  if (gaps.length > 0) {
    const gapsEl = document.createElement('div');
    gapsEl.style.cssText = 'padding:10px 16px;background:#FEF2F2;border-bottom:1px solid #FECACA';
    let gapsHtml = `<div style="font-size:10px;font-weight:700;color:#DC2626;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px">⚠ Gaps (${gaps.length})</div>`;
    gaps.forEach(g => {
      gapsHtml += `<div style="font-size:12px;color:#7F1D1D;padding:3px 0;line-height:1.5">• ${g}</div>`;
    });
    gapsEl.innerHTML = gapsHtml;
    container.appendChild(gapsEl);
  }

  // Visit timeline — collapsible cards
  const visits = (data.visit_progression || []).slice().reverse();
  if (visits.length > 0) {
    const timelineEl = document.createElement('div');
    timelineEl.style.cssText = 'padding:12px 16px;background:white';

    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-size:10px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px';
    titleEl.textContent = `${visits.length} visits`;
    timelineEl.appendChild(titleEl);

    visits.forEach((v, i) => {
      const color = STATUS_COLORS[v.status] || '#6B7280';
      const label = STATUS_LABELS[v.status] || v.status;

      const card = document.createElement('div');
      card.style.cssText = `border-left:3px solid ${color};border-radius:0 6px 6px 0;margin-bottom:6px;background:#FAFBFC;overflow:hidden`;

      const header = document.createElement('button');
      header.style.cssText = `
        width:100%;display:flex;justify-content:space-between;align-items:center;
        padding:8px 10px;background:none;border:none;cursor:pointer;font-family:inherit;text-align:left;
      `;
      header.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:12px;font-weight:700;color:#111827">${v.date}</span>
          <span style="font-size:10px;color:#9CA3AF">▸</span>
        </div>
        <span style="font-size:9px;font-weight:600;color:${color};background:${color}15;padding:2px 6px;border-radius:8px">${label}</span>
      `;

      const detail = document.createElement('div');
      detail.style.cssText = `padding:0 10px 8px 10px;display:${i === 0 ? 'block' : 'none'}`;
      detail.innerHTML = `
        ${v.provider ? `<div style="font-size:10px;color:#9CA3AF;margin-bottom:2px">${v.provider}</div>` : ''}
        <div style="font-size:12px;color:#374151;line-height:1.55">${v.findings}</div>
        ${v.metrics ? `<div style="font-size:11px;color:#6366F1;margin-top:3px;font-weight:500">${v.metrics}</div>` : ''}
      `;

      if (i === 0) {
        header.querySelector('span:nth-child(2)') && (header.innerHTML = header.innerHTML.replace('▸', '▾'));
      }

      header.addEventListener('click', () => {
        const isOpen = detail.style.display !== 'none';
        detail.style.display = isOpen ? 'none' : 'block';
        const arrowSpan = header.querySelector('[style*="9CA3AF"]');
        if (arrowSpan) arrowSpan.textContent = isOpen ? '▸' : '▾';
      });

      card.appendChild(header);
      card.appendChild(detail);
      timelineEl.appendChild(card);
    });

    container.appendChild(timelineEl);
  }

  // Footer
  const footerEl = document.createElement('div');
  footerEl.style.cssText = 'padding:8px 16px;font-size:10px;color:#9CA3AF;background:#F9FAFB;border-top:1px solid #E5E7EB;border-radius:0 0 10px 10px';
  footerEl.textContent = 'AI-generated condition analysis. Verify against patient record.';
  container.appendChild(footerEl);
}
