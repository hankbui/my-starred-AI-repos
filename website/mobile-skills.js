(function () {
    'use strict';

    const DATA_URL = 'data/repos.json?v=' + Date.now();
    const $ = (id) => document.getElementById(id);

    function esc(s) {
        if (s === null || s === undefined) return '';
        const d = document.createElement('div');
        d.textContent = String(s);
        return d.innerHTML;
    }

    function fmtNum(n) {
        n = Number(n) || 0;
        if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
        if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
        return String(n);
    }

    function relTime(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        const now = Date.now();
        const diff = now - d.getTime();
        const hrs = Math.floor(diff / 3600000);
        if (hrs < 1) return 'just now';
        if (hrs < 24) return hrs + 'h ago';
        const days = Math.floor(hrs / 24);
        if (days < 30) return days + 'd ago';
        return d.toLocaleDateString();
    }

    // ---- platform config ----------------------------------------------------

    const PLATFORMS = {
        'react-native': {
            label: 'React Native',
            tag: 'react-native',
            emoji: '⚛️',
            icon: '⚛️',
            matchFn: (r) => {
                const n = (r.name || '').toLowerCase();
                const d = (r.description || '').toLowerCase();
                const t = (r.topics || []).map(x => x.toLowerCase());
                const l = (r.language || '').toLowerCase();
                const cats = ['react-native', 'reactnative', 'react_native', 'expo', 'react native'];
                return cats.some(c => n.includes(c) || t.includes(c) || d.includes(c));
            },
            picks: [
                {
                    name: 'jondot/awesome-react-native',
                    url: 'https://github.com/jondot/awesome-react-native',
                    stars: 35690,
                    badge: '📚 ESSENTIAL',
                    reason: 'The definitive curated list of React Native components, news, tools, and learning material. Every RN dev should know this.',
                    useCase: 'Tìm thư viện RN cho mọi nhu cầu: UI, navigation, storage, camera, payments…',
                },
                {
                    name: 'necolas/react-native-web',
                    url: 'https://github.com/necolas/react-native-web',
                    stars: 22139,
                    badge: '🌐 CROSS-PLATFORM',
                    reason: 'Write React Native components once, run on web + native. Essential for code sharing between mobile and web.',
                    useCase: 'Xây dựng app chạy được trên cả iOS, Android lẫn web từ 1 codebase',
                },
                {
                    name: 'mrousavy/react-native-vision-camera',
                    url: 'https://github.com/mrousavy/react-native-vision-camera',
                    stars: 9523,
                    badge: '📸 CAMERA',
                    reason: 'High-performance camera library with frame processors, barcode scanning, and real-time ML inference.',
                    useCase: 'Tích hợp camera, quét mã QR/barcode, nhận diện object real-time',
                },
                {
                    name: 'gorhom/react-native-bottom-sheet',
                    url: 'https://github.com/gorhom/react-native-bottom-sheet',
                    stars: 9030,
                    badge: '🔄 INTERACTION',
                    reason: 'Performant interactive bottom sheet built on Reanimated + Gesture Handler. The gold standard for modal sheets in RN.',
                    useCase: 'Bottom sheet UI cho settings, picker, comments, action menus',
                },
                {
                    name: 'nativewind/nativewind',
                    url: 'https://github.com/nativewind/nativewind',
                    stars: 8017,
                    badge: '🎨 STYLING',
                    reason: 'Tailwind CSS utility-first workflow for React Native. Write styles inline, no more StyleSheet.create boilerplate.',
                    useCase: 'Styling nhanh với utility classes, responsive design, dark mode dễ dàng',
                },
                {
                    name: 'react-native-webview/react-native-webview',
                    url: 'https://github.com/react-native-webview/react-native-webview',
                    stars: 7182,
                    badge: '🌍 WEBVIEW',
                    reason: 'Cross-platform WebView component maintained by the community. Supports JavaScript injection, cookies, navigation.',
                    useCase: 'Nhúng web content, thanh toán online, OAuth login flows',
                },
            ],
            howto: [
                'Pick a library below for your RN/Expo project',
                'Install via <code>npx expo install</code> or <code>npm install</code>',
                'Import and follow the library docs to integrate',
                'Build premium mobile apps with native-quality UI',
            ],
        },
        'swift': {
            label: 'Swift',
            tag: 'swift',
            emoji: '🍎',
            icon: '🍎',
            matchFn: (r) => {
                const n = (r.name || '').toLowerCase();
                const d = (r.description || '').toLowerCase();
                const t = (r.topics || []).map(x => x.toLowerCase());
                const l = (r.language || '').toLowerCase();
                return n.includes('swift') || n.includes('swiftui') ||
                    t.includes('swift') || t.includes('swiftui') || t.includes('ios') ||
                    l === 'swift' ||
                    d.includes('swiftui') || d.includes('ios app') || d.includes('for ios');
            },
            picks: [
                {
                    name: 'Alamofire/Alamofire',
                    url: 'https://github.com/Alamofire/Alamofire',
                    stars: 42409,
                    badge: '🌐 NETWORKING',
                    reason: 'Elegant HTTP networking in Swift. The de-facto standard for API calls, with async/await support, interceptors, caching.',
                    useCase: 'Gọi REST API, upload/download file, authentication, network logging',
                },
                {
                    name: 'airbnb/lottie-ios',
                    url: 'https://github.com/airbnb/lottie-ios',
                    stars: 26801,
                    badge: '🎬 ANIMATION',
                    reason: 'Render After Effects animations natively on iOS. Lottie files from designers become smooth, performant animations.',
                    useCase: 'Chạy animation từ After Effects, loading animation, onboarding, transitions',
                },
                {
                    name: 'AudioKit/AudioKit',
                    url: 'https://github.com/AudioKit/AudioKit',
                    stars: 11413,
                    badge: '🎵 AUDIO',
                    reason: 'Audio synthesis, processing, and analysis platform for iOS/macOS/tvOS. Playback, recording, MIDI, DSP.',
                    useCase: 'Xử lý âm thanh, synthesizer, recorder, audio analysis cho music app',
                },
                {
                    name: 'MochiDiffusion/MochiDiffusion',
                    url: 'https://github.com/MochiDiffusion/MochiDiffusion',
                    stars: 7910,
                    badge: '🤖 AI IMAGE',
                    reason: 'Run Stable Diffusion natively on Mac with Swift. Full app with prompt history, image gallery, SwiftUI interface.',
                    useCase: 'Tạo ảnh AI trên thiết bị, image generation app mẫu với Core ML + SwiftUI',
                },
                {
                    name: '2FastLabs/agent-squad',
                    url: 'https://github.com/2FastLabs/agent-squad',
                    stars: 7709,
                    badge: '🤖 AI AGENTS',
                    reason: 'Multi-agent AI framework in Swift. Manage multiple agents, tool-use, memory, and complex workflows on-device.',
                    useCase: 'Xây dựng AI agents chạy native trên iOS/macOS, multi-agent collaboration',
                },
                {
                    name: 'osaurus-ai/osaurus',
                    url: 'https://github.com/osaurus-ai/osaurus',
                    stars: 7281,
                    badge: '🧠 AI HARNESS',
                    reason: 'Native macOS harness for AI agents — any model, persistent memory, tool execution. The open-source alternative to Claude Desktop.',
                    useCase: 'Chạy AI agents locally, persistent memory, tool calling trên macOS',
                },
            ],
            howto: [
                'Pick a library or tool below for your Swift project',
                'Add via Swift Package Manager or CocoaPods',
                'Import and follow the library documentation to integrate',
                'Build premium iOS/macOS apps with native performance',
            ],
        },
    };

    // ---- state --------------------------------------------------------------

    const state = {
        data: null,
        tab: 'react-native',
        search: '',
    };

    // ---- curated picks -----------------------------------------------------

    function renderPicks() {
        const el = $('ms-picks');
        const platform = PLATFORMS[state.tab];
        const ps = state.tab === 'react-native'
            ? PLATFORMS['react-native'].picks
            : PLATFORMS['swift'].picks;
        el.innerHTML = ps.map(p => `
            <div class="ms-pick">
                <div class="ms-pick-hd">
                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                        <a class="ms-pick-name" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.name)}</a>
                        <span class="ms-pick-badge">${esc(p.badge)}</span>
                    </div>
                    <span class="ms-pick-stars">⭐ ${fmtNum(p.stars)}</span>
                </div>
                <div class="ms-pick-reason">${esc(p.reason)}</div>
                <div class="ms-pick-use"><b>Dùng để:</b> ${esc(p.useCase)}</div>
                <a class="ms-pick-link" href="${esc(p.url)}" target="_blank" rel="noopener">View on GitHub →</a>
            </div>
        `).join('');
    }

    // ---- howto section -----------------------------------------------------

    function renderHowto() {
        const platform = PLATFORMS[state.tab];
        const body = $('ms-howto-body');
        body.innerHTML = platform.howto.map((s, i) =>
            `<span class="ms-howto-step">${s}</span>`
        ).join(' <span class="ms-howto-arrow">→</span> ');
    }

    // ---- grid ---------------------------------------------------------------

    function filterItems() {
        if (!state.data) return [];
        const platform = PLATFORMS[state.tab];
        let items = state.data.filter(r => platform.matchFn(r));
        const q = state.search.trim().toLowerCase();
        if (q) {
            const terms = q.split(/\s+/);
            items = items.filter(it => {
                const hay = [
                    it.name, it.description, it.language,
                    Array.isArray(it.topics) ? it.topics.join(' ') : '',
                ].filter(Boolean).join(' ').toLowerCase();
                return terms.every(t => hay.includes(t));
            });
        }
        return items;
    }

    function renderCard(item) {
        const tags = (item.topics || []).slice(0, 4).map(t => `<span class="ms-tag">${esc(t)}</span>`).join('');
        const lang = item.language ? `<span class="ms-tag ms-tag-lang">${esc(item.language)}</span>` : '';
        const delta = item.star_delta_1d || item.delta_1d || 0;
        const up = delta > 0 ? `<span class="ms-up">+${fmtNum(delta)} today</span>` : '';
        return `
            <div class="ms-card">
                <div class="ms-card-hd">
                    <a class="ms-card-name" href="${esc(item.url)}" target="_blank" rel="noopener">${esc(item.name)}</a>
                    <span class="ms-card-stars">⭐ ${fmtNum(item.stars || 0)}</span>
                </div>
                <div class="ms-card-desc">${esc(item.description || '')}</div>
                <div class="ms-card-meta">${up ? up + ' · ' : ''}Updated ${relTime(item.pushed_at || item.updated_at)}</div>
                <div class="ms-card-tags">${lang}${tags}</div>
            </div>
        `;
    }

    function renderGrid() {
        const grid = $('ms-grid');
        const empty = $('ms-empty');
        const platform = PLATFORMS[state.tab];
        const all = state.data ? state.data.filter(r => platform.matchFn(r)) : [];
        const items = filterItems();

        $('ms-c-rn').textContent = '(' + (state.data ? state.data.filter(r => PLATFORMS['react-native'].matchFn(r)).length : '…') + ')';
        $('ms-c-sw').textContent = '(' + (state.data ? state.data.filter(r => PLATFORMS['swift'].matchFn(r)).length : '…') + ')';

        $('ms-grid-label').textContent = platform.label;
        $('ms-grid-tag').textContent = platform.tag;

        if (!items.length) {
            grid.innerHTML = '';
            empty.hidden = false;
            empty.innerHTML = '<div class="ms-empty-msg">No repos match. Try a different search term.</div>';
            return;
        }
        empty.hidden = true;
        grid.innerHTML = items.map(renderCard).join('');
    }

    function switchTab(tab) {
        state.tab = tab;
        state.search = '';
        $('ms-search').value = '';
        document.querySelectorAll('.ms-tab').forEach(b => b.classList.toggle('active', b.dataset.msTab === tab));

        const platform = PLATFORMS[tab];
        $('ms-picks-title').textContent = '🏆 Top ' + platform.label + ' Picks';
        $('ms-picks-sub').textContent = 'Hand-picked for ' + platform.label + ' / iOS development.';

        renderPicks();
        renderHowto();
        renderGrid();
    }

    // ---- bind ---------------------------------------------------------------

    function bindControls() {
        document.querySelectorAll('.ms-tab').forEach(btn => {
            btn.addEventListener('click', () => switchTab(btn.dataset.msTab));
        });

        $('ms-search').addEventListener('input', (e) => {
            state.search = e.target.value;
            renderGrid();
        });
    }

    // ---- bootstrap ---------------------------------------------------------

    async function load() {
        try {
            const resp = await fetch(DATA_URL);
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const d = await resp.json();
            state.data = d.starred_repos || d;
        } catch (e) {
            $('ms-grid').innerHTML = '<div class="ms-empty-msg" style="padding:40px;text-align:center;color:var(--text-secondary)">Failed to load: ' + esc(e.message) + '</div>';
            return;
        }
        renderPicks();
        renderHowto();
        renderGrid();
    }

    document.addEventListener('DOMContentLoaded', () => {
        bindControls();
        load();
    });
})();
