'use strict';

/* Shared Ask AI logic for all research pages.
 * Requires global `state` with { meta, papers, technologies, product_opportunities, filtered, brief }.
 * Call `bindAskAi(pageTitle)` after page data is loaded.
 */

function buildAiPrompt(pageTitle) {
    const count = parseInt(document.getElementById('rd-ai-count').value, 10);
    const includeDescEl = document.getElementById('rd-ai-include-desc');
    const includeDesc = includeDescEl ? includeDescEl.checked : true;
    const hasPapers = state.papers && state.papers.length;
    const hasTechs = state.technologies && state.technologies.length;
    const hasOpps = state.product_opportunities && state.product_opportunities.length;

    let text = `${pageTitle} — ${state.meta.date || 'latest'}\n\n`;

    if (state.brief && state.brief.length) {
        text += 'Brief:\n' + state.brief.map((b) => '- ' + b).join('\n') + '\n\n';
    }

    if (hasTechs) {
        text += `Technologies (${state.technologies.length}):\n`;
        state.technologies.slice(0, 30).forEach((t) => {
            text += `- ${t.name} | maturity: ${t.maturity} | confidence: ${Math.round((t.confidence || 0) * 100)}% | trend: ${t.trend}`;
            if ((t.applications || []).length) text += ` | apps: ${t.applications.slice(0, 3).join(', ')}`;
            text += '\n';
        });
        text += '\n';
    }

    if (hasPapers) {
        const papers = count > 0 ? state.papers.slice(0, count) : state.papers;
        text += `Papers (${papers.length}):\n`;
        papers.forEach((p, i) => {
            text += `${i + 1}. "${p.title}" by ${(p.authors || []).join(', ')}`;
            text += ` | maturity: ${p.maturity} | confidence: ${Math.round((p.confidence || 0) * 100)}%`;
            if (includeDesc) text += `\n   Summary: ${p.summary}`;
            if ((p.technologies || []).length) text += `\n   Technologies: ${p.technologies.join(', ')}`;
            text += '\n';
        });
        text += '\n';
    }

    if (hasOpps) {
        text += `Product Opportunities (${state.product_opportunities.length}):\n`;
        state.product_opportunities.slice(0, 20).forEach((o) => {
            text += `- [${o.technology}] ${o.idea} | value: ${o.business_value}/5 | difficulty: ${o.engineering_difficulty}/5 | advantage: ${o.competitive_advantage}\n`;
        });
        text += '\n';
    }

    const question = document.getElementById('rd-ai-question').value.trim();
    if (question) text += `\nMy question: ${question}`;
    return text;
}

function updateAiPreview(pageTitle) {
    const preview = document.getElementById('rd-ai-preview');
    const meter = document.getElementById('rd-ai-meter');
    const warning = document.getElementById('rd-ai-warning');
    const prompt = buildAiPrompt(pageTitle);
    preview.value = prompt;
    const chars = prompt.length;
    const urlLength = chars + 'https://www.google.com/search?q=&udm=50'.length;
    const total = state.papers ? state.papers.length : (state.technologies ? state.technologies.length : 0);
    meter.textContent = `${total} items • ${chars.toLocaleString()} chars • URL ~${urlLength.toLocaleString()}`;
    warning.hidden = urlLength < 29000;
    warning.textContent = urlLength >= 29000 ? '⚠️ Prompt may exceed URL length limit' : '';
}

function bindAskAi(pageTitle) {
    const backdrop = document.getElementById('rd-ai-backdrop');
    const modal = document.getElementById('rd-ai-modal');
    const openBtn = document.getElementById('rd-ask-ai');
    const closeBtn = document.getElementById('rd-ai-close');
    const copyBtn = document.getElementById('rd-ai-copy');
    const goBtn = document.getElementById('rd-ai-open');
    const question = document.getElementById('rd-ai-question');
    const count = document.getElementById('rd-ai-count');
    const includeDesc = document.getElementById('rd-ai-include-desc');

    if (!openBtn) return;

    function openModal() {
        const ctx = document.getElementById('rd-ai-context');
        const parts = [];
        if (state.papers && state.papers.length) parts.push(`${state.papers.length} papers`);
        if (state.technologies && state.technologies.length) parts.push(`${state.technologies.length} technologies`);
        if (state.product_opportunities && state.product_opportunities.length) parts.push(`${state.product_opportunities.length} opportunities`);
        ctx.textContent = `Based on ${parts.join(', ')} from ${state.meta.date || 'latest scan'}.`;
        updateAiPreview(pageTitle);
        backdrop.hidden = false;
        modal.classList.add('open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('drawer-open');
        setTimeout(() => question.focus(), 100);
    }

    function closeModal() {
        backdrop.hidden = true;
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('drawer-open');
    }

    openBtn.addEventListener('click', openModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    backdrop.addEventListener('click', closeModal);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
    question.addEventListener('input', () => updateAiPreview(pageTitle));
    if (count) count.addEventListener('change', () => updateAiPreview(pageTitle));
    if (includeDesc) includeDesc.addEventListener('change', () => updateAiPreview(pageTitle));

    copyBtn.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(buildAiPrompt(pageTitle)); copyBtn.textContent = 'Copied ✓'; setTimeout(() => { copyBtn.textContent = 'Copy prompt'; }, 1400); }
        catch { copyBtn.textContent = 'Failed'; setTimeout(() => { copyBtn.textContent = 'Copy prompt'; }, 1400); }
    });
    goBtn.addEventListener('click', () => {
        const prompt = buildAiPrompt(pageTitle);
        const url = 'https://www.google.com/search?q=' + encodeURIComponent(prompt) + '&udm=50';
        window.open(url, '_blank', 'noopener');
    });

    const promptsBtn = document.getElementById('rd-prompts-btn');
    const promptsMenu = document.getElementById('rd-prompts-menu');
    if (promptsBtn) {
        promptsBtn.addEventListener('click', (e) => { e.stopPropagation(); promptsMenu.hidden = !promptsMenu.hidden; });
        document.addEventListener('click', () => { promptsMenu.hidden = true; });
        promptsMenu.addEventListener('click', (e) => e.stopPropagation());
        promptsMenu.querySelectorAll('.prompts-item').forEach((item) => {
            item.addEventListener('click', () => {
                question.value = item.dataset.prompt;
                promptsMenu.hidden = true;
                updateAiPreview(pageTitle);
            });
        });
    }

    const addBtn = document.getElementById('rd-prompts-add');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            const custom = prompt('Enter your custom prompt:');
            if (custom && custom.trim()) {
                const list = document.getElementById('prompts-custom-list');
                const group = document.getElementById('prompts-custom-group');
                group.hidden = false;
                const btn = document.createElement('button');
                btn.className = 'prompts-item';
                btn.textContent = custom.trim().slice(0, 60) + (custom.trim().length > 60 ? '…' : '');
                btn.dataset.prompt = custom.trim();
                btn.addEventListener('click', () => { question.value = btn.dataset.prompt; promptsMenu.hidden = true; updateAiPreview(pageTitle); });
                list.appendChild(btn);
            }
        });
    }
}