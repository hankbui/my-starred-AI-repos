'use strict';

/* Shared Ask AI logic for all research pages.
 * Each page provides `window.buildPrompt()` which returns the prompt text.
 * Call `bindAskAi()` after page data is loaded.
 */

function updateAiPreview() {
    const preview = document.getElementById('rd-ai-preview');
    const meter = document.getElementById('rd-ai-meter');
    const warning = document.getElementById('rd-ai-warning');
    if (!preview) return;
    const prompt = window.buildPrompt ? window.buildPrompt() : '';
    preview.value = prompt;
    const chars = prompt.length;
    const urlLength = chars + 'https://www.google.com/search?q=&udm=50'.length;
    meter.textContent = `${chars.toLocaleString()} chars • URL ~${urlLength.toLocaleString()}`;
    warning.hidden = urlLength < 29000;
    warning.textContent = urlLength >= 29000 ? '⚠️ Prompt may exceed URL length limit' : '';
}

function bindAskAi() {
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
        if (ctx && window.buildContextText) ctx.textContent = window.buildContextText();
        updateAiPreview();
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
    question.addEventListener('input', updateAiPreview);
    if (count) count.addEventListener('change', updateAiPreview);
    if (includeDesc) includeDesc.addEventListener('change', updateAiPreview);

    copyBtn.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(window.buildPrompt ? window.buildPrompt() : ''); copyBtn.textContent = 'Copied ✓'; setTimeout(() => { copyBtn.textContent = 'Copy prompt'; }, 1400); }
        catch { copyBtn.textContent = 'Failed'; setTimeout(() => { copyBtn.textContent = 'Copy prompt'; }, 1400); }
    });
    goBtn.addEventListener('click', async () => {
        const prompt = window.buildPrompt ? window.buildPrompt() : '';
        const q = encodeURIComponent(prompt);
        const url = 'https://www.google.com/search?q=' + q + '&udm=50';

        // Always copy first as backup (same pattern as app.js)
        try { await navigator.clipboard.writeText(prompt); } catch {}

        // If URL exceeds ~28K, trim by removing summaries and auto-copy full prompt
        if (url.length > 28000) {
            const short = window.buildPromptShort ? window.buildPromptShort() : prompt.slice(0, 2000);
            const shortUrl = 'https://www.google.com/search?q=' + encodeURIComponent(short) + '&udm=50';
            window.open(shortUrl, '_blank', 'noopener');
        } else {
            window.open(url, '_blank', 'noopener');
        }
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