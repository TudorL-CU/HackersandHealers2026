const API_BASE = 'http://localhost:8000/api';
const PREVIEW_COUNT = 3;
const STORY_PREVIEW_LENGTH = 180;

const $ = (id) => document.getElementById(id);

// --- Analyze Page ---

$('analyzePageBtn').addEventListener('click', async () => {
  const btn = $('analyzePageBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="analyze-icon">&#9672;</span> Reading page...';
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
    btn.innerHTML = '<span class="analyze-icon">&#9672;</span> Analyze This Page';
    $('loading').style.display = 'none';
  }
});

// --- Search ---

$('searchForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const query = $('searchInput').value.trim();
  const btn = $('searchBtn');
  btn.disabled = true;
  btn.textContent = 'Searching...';
  $('searchResults').innerHTML = '';

  try {
    const params = new URLSearchParams({ count: '10' });
    if (query && /^\d+$/.test(query)) {
      params.set('id', query);
    } else if (query) {
      params.set('name', query);
    }

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
  if (patients.length === 0) {
    container.innerHTML = '<div class="no-results">No patients found.</div>';
    return;
  }

  let html = `<div class="search-result-count">${patients.length} patient(s) found</div>`;
  for (const p of patients) {
    html += `
      <button class="patient-btn" data-id="${p.id}" data-name="${p.name}" data-dob="${p.birthDate}" data-gender="${p.gender}">
        <div>
          <div class="patient-btn-name">${p.name}</div>
          <div class="patient-btn-meta">DOB: ${p.birthDate} | ${p.gender}</div>
        </div>
        <span class="patient-btn-id">ID: ${p.id}</span>
      </button>
    `;
  }
  container.innerHTML = html;

  container.querySelectorAll('.patient-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      runCopilot({
        id: btn.dataset.id,
        name: btn.dataset.name,
        birthDate: btn.dataset.dob,
        gender: btn.dataset.gender,
      });
    });
  });
}

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
  $('patientMeta').textContent = `${patient.birthDate} | ${patient.gender} | ID: ${patient.id}`;
  $('analysisTime').textContent = `${processing_time_seconds}s`;

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
