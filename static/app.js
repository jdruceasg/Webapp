// ── State ─────────────────────────────────────────────────────────────────
let currentData = null;

// ── Helpers ───────────────────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const show = id => { const el=$(id); if(el) el.style.display=''; };
const hide = id => { const el=$(id); if(el) el.style.display='none'; };
const esc  = s  => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function setText(id, val) {
  const el = $(id);
  if (el) el.textContent = val;
}

// ── Quick fill examples ────────────────────────────────────────────────────
function quickFill(name, loc, specialty) {
  $('practiceName').value  = name;
  $('location').value      = loc;
  if (specialty) $('specialty').value = specialty;
  $('practiceName').focus();
}

// ── Reset ──────────────────────────────────────────────────────────────────
function resetApp() {
  hide('resultsPanel');
  hide('loadingPanel');
  hide('errorBar');
  hide('disclaimer');
  show('formPanel');
  currentData = null;
  $('practiceName').focus();
}

// ── Tab switching ──────────────────────────────────────────────────────────
function switchTab(tabId, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  const el = $(tabId);
  if (el) el.classList.add('active');
}

// ── Analysis ───────────────────────────────────────────────────────────────
async function startAnalysis() {
  const name     = $('practiceName').value.trim();
  const npi      = $('npiNumber').value.trim();
  const location = $('location').value.trim();
  const website  = $('website').value.trim();
  const specialty= $('specialty').value;
  const notes    = $('notes').value.trim();

  if (!name) { $('practiceName').focus(); return; }

  // UI state
  hide('formPanel');
  hide('resultsPanel');
  hide('errorBar');
  hide('disclaimer');
  show('loadingPanel');
  $('analyzeBtn').disabled = true;
  $('loadingTitle').textContent = `Analyzing ${name}...`;
  setStep(0);

  try {
    const resp = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ practice_name: name, npi_number: npi, location, website, specialty, notes }),
    });

    if (!resp.ok || !resp.body) {
      throw new Error(`HTTP ${resp.status}`);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') break;

        let msg;
        try { msg = JSON.parse(raw); } catch { continue; }

        if (msg.type === 'status') {
          setStep(msg.step);
          $('loadingTitle').textContent = msg.message;
        } else if (msg.type === 'result') {
          renderResults(msg.data);
        } else if (msg.type === 'error') {
          showError(msg.message);
          return;
        }
      }
    }
  } catch (e) {
    showError('Network error: ' + e.message);
  } finally {
    $('analyzeBtn').disabled = false;
    hide('loadingPanel');
  }
}

// ── Step indicator ─────────────────────────────────────────────────────────
function setStep(n) {
  for (let i = 1; i <= 4; i++) {
    const el = $(`lstep${i}`);
    if (!el) continue;
    el.className = 'lstep' + (i < n ? ' done' : i === n ? ' active' : '');
  }
}

// ── Error ──────────────────────────────────────────────────────────────────
function showError(msg) {
  $('errorMsg').textContent = msg;
  show('errorBar');
  show('formPanel');
}

// ── Render results ─────────────────────────────────────────────────────────
function renderResults(d) {
  currentData = d;
  const A = d.A || {};
  const B = d.B || {};
  const C = d.C || {};
  const D = d.D || {};
  const E = d.E || {};
  const F = d.F || {};
  const G = d.G || {};
  const H = d.H || {};
  const meta = d.meta || {};

  // Header
  setText('rName', A.practice_name || meta.prospect_name || '—');
  setText('rMeta', [A.location, A.specialty_focus].filter(Boolean).join(' · ') || '—');

  // Confidence badge
  const conf = (G.confidence || '').toLowerCase();
  const badge = $('confidenceBadge');
  badge.textContent = G.confidence ? `${G.confidence} Confidence` : '—';
  badge.className = 'confidence-badge ' + (conf || '');

  // NPI badge
  if (meta.npi_verified) { show('npiBadge'); } else { hide('npiBadge'); }

  // NBA
  setText('nbaAction', H.action || '—');
  setText('nbaDetail', H.detail || '');

  // ── Tab A ──────────────────────────────────────────────────────────────
  const stats = $('profileStats');
  stats.innerHTML = [
    ['Location', A.location],
    ['Specialty', A.specialty_focus],
    ['Providers', A.providers],
    ['Services', (A.publicly_visible_services||[]).length + ' listed'],
  ].map(([label, val]) => val ? `
    <div class="stat-item">
      <div class="stat-label">${esc(label)}</div>
      <div class="stat-value">${esc(val)}</div>
    </div>` : '').join('');

  const signals = $('signalList');
  const sigs = A.buying_signals || [];
  signals.innerHTML = sigs.length
    ? sigs.map(s => `<li>${esc(s)}</li>`).join('')
    : '<li>No specific signals found in public data</li>';

  const chips = $('serviceChips');
  chips.innerHTML = (A.publicly_visible_services || [])
    .map(s => `<span class="service-chip">${esc(s)}</span>`).join('');

  // ── Tab B ──────────────────────────────────────────────────────────────
  setText('workflowSummary', B.workflow_summary || '');
  const wfEl = $('workflowSteps');
  wfEl.innerHTML = (B.steps || []).map(s => `
    <div class="wf-step">
      <div class="wf-step-line">
        <div class="wf-dot"></div>
        <div class="wf-connector"></div>
      </div>
      <div>
        <div class="wf-label">${esc(s.label)}</div>
        <div class="wf-detail">${esc(s.detail)}</div>
      </div>
    </div>`).join('');

  // ── Tab C ──────────────────────────────────────────────────────────────
  const stages = $('productStages');
  stages.innerHTML = (C.stages || []).map(s => `
    <div class="stage-row">
      <div class="stage-name">${esc(s.stage)}</div>
      <div class="stage-products">${(s.products||[]).map(p=>`<span class="stage-product">${esc(p)}</span>`).join('')}</div>
      <div class="stage-type">${esc(s.type||'')}</div>
    </div>`).join('');

  // ── Tab D ──────────────────────────────────────────────────────────────
  const tbody = $('codeTableBody');
  tbody.innerHTML = (D.codes || []).map(c => {
    const typeClass = {
      CPT: 'code-type-cpt', HCPCS: 'code-type-hcpcs',
      'ICD-10': 'code-type-icd10', NDC: 'code-type-ndc'
    }[c.type] || '';
    return `<tr>
      <td><span class="${typeClass}">${esc(c.type)}</span></td>
      <td>${esc(c.code)}</td>
      <td>${esc(c.description)}</td>
      <td>${esc(c.sales_meaning)}</td>
    </tr>`;
  }).join('');

  // ── Tab E ──────────────────────────────────────────────────────────────
  const reorderEl = $('reorderList');
  reorderEl.innerHTML = (E.items || []).map(item => {
    const cls = {
      'Daily-Use Consumable': 'class-daily',
      'Monthly Reorder': 'class-monthly',
      'Procedure-Driven': 'class-proc',
      'Annual Maintenance': 'class-annual',
      'Long-Cycle Capital': 'class-capital',
      'Warranty/Service': 'class-warranty',
    }[item.class] || 'class-daily';
    return `<div class="reorder-item">
      <div class="reorder-class ${cls}">${esc(item.class||'')}</div>
      <div>
        <div class="reorder-name">${esc(item.product)}</div>
        <div class="reorder-notes">${esc(item.notes||'')}</div>
      </div>
    </div>`;
  }).join('');

  // ── Tab F ──────────────────────────────────────────────────────────────
  const xsellEl = $('crosssellList');
  xsellEl.innerHTML = (F.opportunities || []).map(o => `
    <div class="xsell-item">
      <div class="xsell-anchor">
        <div class="xsell-anchor-label">Anchor</div>
        <div class="xsell-anchor-name">${esc(o.anchor)}</div>
      </div>
      <div class="xsell-arrow">→</div>
      <div class="xsell-right">
        <div class="xsell-product-label">Recommend</div>
        <div class="xsell-product-name">${esc(o.cross_sell)}</div>
        <div class="xsell-rationale">${esc(o.rationale)}</div>
      </div>
    </div>`).join('');

  // ── Tab G ──────────────────────────────────────────────────────────────
  $('whyFit').textContent = G.why_fit || '—';

  const topOpps = $('topOpps');
  topOpps.innerHTML = (G.top_opportunities || []).map((o, i) => `
    <div class="top-opp-item">
      <div class="top-opp-num">${i+1}</div>
      <span>${esc(o)}</span>
    </div>`).join('');

  const confDetail = $('confidenceDetail');
  confDetail.innerHTML = `
    <div class="conf-level ${conf}">
      <div class="conf-level-label">${G.confidence || '—'} Confidence</div>
    </div>
    <div class="conf-reasoning">${esc(G.confidence_reasoning || '—')}</div>
    ${(G.buying_signals||[]).map(s=>`<div class="conf-reasoning">• ${esc(s)}</div>`).join('')}
  `;

  // Show results, switch to Tab A
  show('resultsPanel');
  show('disclaimer');
  hide('formPanel');

  // Reset to tab A
  document.querySelectorAll('.tab-btn').forEach((b,i) => { b.classList.toggle('active', i===0); });
  document.querySelectorAll('.tab-content').forEach((t,i) => { t.classList.toggle('active', i===0); });
}

// ── Keyboard shortcuts ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  ['practiceName','npiNumber','location','website'].forEach(id => {
    $(id)?.addEventListener('keydown', e => { if (e.key === 'Enter') startAnalysis(); });
  });
  $('practiceName')?.focus();
});
