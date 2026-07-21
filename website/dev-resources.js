/* Dev Resources — curated directory of the best websites for developers.
 *
 * Data is embedded directly in this file (static, hand-curated). To add a site,
 * append an object to RESOURCES below with: name, url, icon (emoji), categories
 * (array), description, and optional flags (free/paid/popular/opensource).
 *
 * Zero dependencies. Vanilla JS, same patterns as automation.js / hf-daily.js.
 */
(function () {
    'use strict';

    const MAX_PER_CAT = 200;

    // ---- DATA ---------------------------------------------------------------
    // Categories: design, coding, ai, frontend, devops, learning, data, api,
    //             productivity, community, analytics, startup

    const RESOURCES = [
        // ── DESIGN ─────────────────────────────────────────────────────────
        { name: 'Mobbin', url: 'https://mobbin.com', icon: '📱', categories: ['design'], description: 'The largest database of mobile & web app design patterns. Reference designs from top apps.', tags: ['patterns', 'ios', 'android', 'web'] },
        { name: 'Dribbble', url: 'https://dribbble.com', icon: '🎨', categories: ['design'], description: 'Design inspiration from top designers worldwide. UI/UX shots, logos, illustrations.', tags: ['inspiration', 'ui'] },
        { name: 'Behance', url: 'https://www.behance.net', icon: '🖼️', categories: ['design'], description: 'Adobe\'s portfolio platform for creative professionals. Full project case studies.', tags: ['portfolio', 'inspiration'] },
        { name: 'Lucide Icons', url: 'https://lucide.dev', icon: '✨', categories: ['design', 'frontend'], description: 'Beautiful, consistent, open-source icon set (fork of Feather). 1,500+ icons.', tags: ['icons', 'opensource', 'free'], flags: ['opensource', 'free'] },
        { name: 'Heroicons', url: 'https://heroicons.com', icon: '⚡', categories: ['design', 'frontend'], description: 'Hand-crafted SVG icons by the Tailwind team. Outline & solid variants.', tags: ['icons', 'tailwind', 'free'], flags: ['free'] },
        { name: 'Phosphor Icons', url: 'https://phosphoricons.com', icon: '🔆', categories: ['design', 'frontend'], description: 'Flexible icon family with 6 weights (thin/light/regular/bold/fill/duotone).', tags: ['icons', 'free'], flags: ['free'] },
        { name: 'Iconify', url: 'https://iconify.design', icon: '🗂️', categories: ['design', 'frontend'], description: '200,000+ icons from 150+ icon sets in one framework. On-demand loading.', tags: ['icons', 'framework', 'free'], flags: ['free'] },
        { name: 'Tabler Icons', url: 'https://tabler.io/icons', icon: '🔱', categories: ['design', 'frontend'], description: '5,700+ free open-source SVG icons. No attribution required.', tags: ['icons', 'opensource', 'free'], flags: ['opensource', 'free'] },
        { name: 'Figma', url: 'https://www.figma.com', icon: '🎯', categories: ['design', 'productivity'], description: 'Collaborative interface design tool. The industry standard for UI/UX design.', tags: ['ui', 'collaboration', 'popular'], flags: ['popular'] },
        { name: 'Figma Community', url: 'https://www.figma.com/community', icon: '🌐', categories: ['design'], description: 'Free UI kits, icons, mockups, and plugins from the Figma community.', tags: ['free', 'kits', 'plugins'] },
        { name: 'Coolors', url: 'https://coolors.co', icon: '🌈', categories: ['design'], description: 'Fast color palette generator. Browse trending palettes, export in any format.', tags: ['color', 'palette', 'free'], flags: ['free'] },
        { name: 'Realtime Colors', url: 'https://realtimecolors.com', icon: '🖍️', categories: ['design'], description: 'Visualize your colors, fonts, and UI in real-time on a live mockup site.', tags: ['color', 'typography', 'free'], flags: ['free'] },
        { name: 'Tailwind CSS', url: 'https://tailwindcss.com', icon: '💨', categories: ['design', 'frontend'], description: 'Utility-first CSS framework. The most popular modern CSS approach.', tags: ['css', 'framework', 'popular'], flags: ['popular', 'opensource'] },
        { name: 'Tailwind UI', url: 'https://tailwindui.com', icon: '🧱', categories: ['design', 'frontend'], description: 'Premium UI components and templates built with Tailwind CSS.', tags: ['components', 'paid'], flags: ['paid'] },
        { name: 'Shadcn UI', url: 'https://ui.shadcn.com', icon: '🌑', categories: ['design', 'frontend'], description: 'Beautiful, accessible React components you copy & paste. Radix + Tailwind.', tags: ['react', 'components', 'opensource', 'free'], flags: ['opensource', 'free', 'popular'] },
        { name: 'Magic UI', url: 'https://magicui.design', icon: '✨', categories: ['design', 'frontend'], description: '150+ animated React components built with Tailwind + Motion.', tags: ['react', 'animation', 'free'], flags: ['free'] },
        { name: 'Aceternity UI', url: 'https://ui.aceternity.com', icon: '🌌', categories: ['design', 'frontend'], description: 'Trendy animated component library. Eye-catching landing page components.', tags: ['react', 'animation', 'free'], flags: ['free'] },
        { name: 'Hyperui', url: 'https://www.hyperui.dev', icon: '📦', categories: ['design', 'frontend'], description: 'Free open-source Tailwind components. No JS framework lock-in.', tags: ['tailwind', 'components', 'free'], flags: ['free'] },
        { name: 'Google Fonts', url: 'https://fonts.google.com', icon: '🔤', categories: ['design'], description: 'Free open-source fonts. Hundreds of font families with easy CSS integration.', tags: ['fonts', 'free', 'popular'], flags: ['free', 'popular'] },
        { name: 'Fonts in Use', url: 'https://fontsinuse.com', icon: '🗞️', categories: ['design'], description: 'Real-world typography case studies. See how fonts look in the wild.', tags: ['typography'] },
        { name: 'Lottiefiles', url: 'https://lottiefiles.com', icon: '🎬', categories: ['design', 'frontend'], description: 'Lightweight JSON animations. Free + premium, easy to use in web/mobile.', tags: ['animation', 'free'], flags: ['free'] },
        { name: 'Unsplash', url: 'https://unsplash.com', icon: '📷', categories: ['design'], description: 'Free high-resolution photos. The standard for stock imagery.', tags: ['photos', 'free', 'popular'], flags: ['free', 'popular'] },
        { name: 'Pexels', url: 'https://www.pexels.com', icon: '🎥', categories: ['design'], description: 'Free stock photos and videos. Strong video library.', tags: ['photos', 'video', 'free'], flags: ['free'] },
        { name: 'Undraw', url: 'https://undraw.co', icon: '🖼️', categories: ['design'], description: 'Free open-source SVG illustrations. Customize colors easily.', tags: ['illustration', 'free'], flags: ['free'] },
        { name: 'Storyset', url: 'https://storyset.com', icon: '👯', categories: ['design'], description: 'Free customizable illustrations for your projects.', tags: ['illustration', 'free'], flags: ['free'] },
        { name: 'uICards', url: 'https://uicards.io', icon: '🃏', categories: ['design'], description: 'Hand-crafted UI design elements and inspirations.', tags: ['inspiration'] },
        { name: 'Godly', url: 'https://godly.website', icon: '⛪', categories: ['design'], description: 'Curated showcase of the best awwward-winning websites.', tags: ['inspiration', 'popular'] },
        { name: 'Awwwards', url: 'https://www.awwwards.com', icon: '🏆', categories: ['design'], description: 'The awards for design, creativity and innovation on the internet.', tags: ['inspiration', 'awards'] },
        { name: 'Landbook', url: 'https://land-book.com', icon: '📕', categories: ['design'], description: 'Hand-picked gallery of the best landing page designs.', tags: ['landing', 'inspiration'] },
        { name: 'One Page Love', url: 'https://onepagelove.com', icon: '💚', categories: ['design'], description: 'Inspiration for one-page websites, templates, and landing pages.', tags: ['landing', 'inspiration'] },
        { name: 'UI Sources', url: 'https://www.uisources.com', icon: '📺', categories: ['design'], description: 'Real app screen recordings for interaction inspiration.', tags: ['inspiration', 'motion'] },
        { name: 'Page Flows', url: 'https://pageflows.com', icon: '🌊', categories: ['design'], description: 'User flow videos from top products. Onboarding, signup, etc.', tags: ['flows', 'inspiration'] },
        { name: 'Collectui', url: 'https://collectui.com', icon: '🗂️', categories: ['design'], description: 'Daily inspiration from daily ui categories.', tags: ['inspiration'] },
        { name: 'Hyper Make', url: 'https://www.hypermakes.com', icon: '🔧', categories: ['design'], description: 'AI-assisted design tool for rapid prototyping.', tags: ['ai', 'prototype'] },

        // ── CODING ──────────────────────────────────────────────────────────
        { name: 'GitHub', url: 'https://github.com', icon: '🐙', categories: ['coding', 'community'], description: 'The largest code host. Open-source hub, issues, actions, packages.', tags: ['git', 'hosting', 'popular'], flags: ['popular'] },
        { name: 'Stack Overflow', url: 'https://stackoverflow.com', icon: '📚', categories: ['coding', 'community'], description: 'Q&A for programmers. The default place for technical answers.', tags: ['qa', 'popular'], flags: ['popular'] },
        { name: 'MDN Web Docs', url: 'https://developer.mozilla.org', icon: '📖', categories: ['coding', 'frontend', 'learning'], description: 'Mozilla\'s documentation for HTML, CSS, JS, and web APIs. The gold standard.', tags: ['docs', 'web', 'free', 'popular'], flags: ['free', 'popular'] },
        { name: 'DevDocs', url: 'https://devdocs.io', icon: '📑', categories: ['coding'], description: 'Combined docs for many APIs in one fast, offline-capable interface.', tags: ['docs', 'free', 'offline'], flags: ['free'] },
        { name: 'Can I Use', url: 'https://caniuse.com', icon: '✅', categories: ['coding', 'frontend'], description: 'Browser support tables for modern web technologies.', tags: ['compatibility', 'free'], flags: ['free'] },
        { name: 'Regex101', url: 'https://regex101.com', icon: '🔮', categories: ['coding'], description: 'Build, test, and debug regex with full explanation.', tags: ['regex', 'free'], flags: ['free'] },
        { name: 'Regexr', url: 'https://regexr.com', icon: '🧩', categories: ['coding'], description: 'Regex tester with cheatsheet and community patterns.', tags: ['regex', 'free'], flags: ['free'] },
        { name: 'Carbon', url: 'https://carbon.now.sh', icon: '🖤', categories: ['coding', 'productivity'], description: 'Create beautiful images of your source code. Great for tweets/blogs.', tags: ['images', 'free'], flags: ['free'] },
        { name: 'Ray.so', url: 'https://ray.so', icon: '🌈', categories: ['coding', 'productivity'], description: 'Beautiful code snippets to share. From the Raycast team.', tags: ['images', 'free'], flags: ['free'] },
        { name: 'CodeSandbox', url: 'https://codesandbox.io', icon: '📦', categories: ['coding', 'frontend'], description: 'Online IDE for web apps. Instant share, no setup.', tags: ['ide', 'free'], flags: ['free'] },
        { name: 'StackBlitz', url: 'https://stackblitz.com', icon: '⚡', categories: ['coding', 'frontend'], description: 'Instant dev environments in your browser. Powered by WebContainers.', tags: ['ide', 'free'], flags: ['free'] },
        { name: 'Replit', url: 'https://replit.com', icon: '🌀', categories: ['coding'], description: 'Online IDE for any language. Collaborative coding, deploy from browser.', tags: ['ide'] },
        { name: 'CodePen', url: 'https://codepen.io', icon: '🖊️', categories: ['coding', 'frontend'], description: 'Front-end playground. Demo, share, and discover HTML/CSS/JS.', tags: ['playground', 'free'], flags: ['free'] },
        { name: 'JSFiddle', url: 'https://jsfiddle.net', icon: '🍲', categories: ['coding', 'frontend'], description: 'Online IDE for HTML/CSS/JS. The classic front-end testbed.', tags: ['playground', 'free'], flags: ['free'] },
        { name: 'Refactoring.guru', url: 'https://refactoring.guru', icon: '🧠', categories: ['coding', 'learning'], description: 'Design patterns and refactoring explained with great illustrations.', tags: ['patterns', 'free'], flags: ['free'] },
        { name: 'Roadmap.sh', url: 'https://roadmap.sh', icon: '🗺️', categories: ['coding', 'learning'], description: 'Community roadmaps for developer roles (frontend, backend, devops, AI).', tags: ['roadmaps', 'free', 'popular'], flags: ['free', 'popular'] },
        { name: 'Syntax.fm', url: 'https://syntax.fm', icon: '🎙️', categories: ['coding', 'learning'], description: 'Wes Bos & Scott Tolinski\'s web dev podcast. Weekly deep dives.', tags: ['podcast', 'frontend'] },
        { name: 'Screeps', url: 'https://screeps.com', icon: '🎮', categories: ['coding'], description: 'MMO for programmers — control your colony by writing JS.', tags: ['game', 'programming'] },

        // ── AI & ML ─────────────────────────────────────────────────────────
        { name: 'Hugging Face', url: 'https://huggingface.co', icon: '🤗', categories: ['ai', 'data'], description: 'The AI community building the future. Models, datasets, spaces, papers.', tags: ['models', 'datasets', 'popular'], flags: ['popular'] },
        { name: 'Papers with Code', url: 'https://paperswithcode.com', icon: '📄', categories: ['ai', 'learning'], description: 'Papers + code + benchmarks. Browse SOTA on every ML task.', tags: ['research', 'free'], flags: ['free'] },
        { name: 'Kaggle', url: 'https://www.kaggle.com', icon: '🏆', categories: ['ai', 'data', 'learning'], description: 'Competitions, datasets, notebooks. The ML playground.', tags: ['competitions', 'free', 'popular'], flags: ['free', 'popular'] },
        { name: 'Google Colab', url: 'https://colab.research.google.com', icon: '📒', categories: ['ai', 'coding'], description: 'Free Jupyter notebooks with GPU/TPU. No setup.', tags: ['notebook', 'gpu', 'free'], flags: ['free'] },
        { name: 'Fast.ai', url: 'https://www.fast.ai', icon: '⚡', categories: ['ai', 'learning'], description: 'Practical deep learning for coders. Free, top-rated course.', tags: ['course', 'free'], flags: ['free'] },
        { name: 'Google AI Studio', url: 'https://aistudio.google.com', icon: '✨', categories: ['ai'], description: 'Build with Gemini. Free generous tier for prototyping.', tags: ['gemini', 'free'], flags: ['free'] },
        { name: 'OpenAI Platform', url: 'https://platform.openai.com', icon: '🟢', categories: ['ai', 'api'], description: 'API access to GPT, DALL-E, Whisper, embeddings.', tags: ['api', 'gpt', 'popular'], flags: ['popular'] },
        { name: 'Anthropic Console', url: 'https://console.anthropic.com', icon: '🟣', categories: ['ai', 'api'], description: 'Build with Claude. Long context, strong reasoning.', tags: ['api', 'claude'] },
        { name: 'Replicate', url: 'https://replicate.com', icon: '🔁', categories: ['ai', 'api'], description: 'Run open-source models via API. Pay per second.', tags: ['api', 'models'] },
        { name: 'Together AI', url: 'https://www.together.ai', icon: '🤝', categories: ['ai', 'api'], description: 'Fast, cheap inference for 200+ open-source models.', tags: ['api', 'inference'] },
        { name: 'OpenRouter', url: 'https://openrouter.ai', icon: '🛣️', categories: ['ai', 'api'], description: 'One API for all LLMs. Compare models side-by-side.', tags: ['api', 'router'] },
        { name: 'LangSmith', url: 'https://smith.langchain.com', icon: '🪢', categories: ['ai'], description: 'Trace, eval, and observe LLM apps. By LangChain.', tags: ['observability', 'llm'] },
        { name: 'Weights & Biases', url: 'https://wandb.ai', icon: '🧪', categories: ['ai', 'devops'], description: 'Experiment tracking, model registry, evals for ML teams.', tags: ['mlops', 'popular'], flags: ['popular'] },
        { name: 'LangChain Hub', url: 'https://smith.langchain.com/hub', icon: '🧱', categories: ['ai'], description: 'Discover, share, and reuse LangChain prompts, chains, agents.', tags: ['prompts', 'agents'] },
        { name: 'Ollama', url: 'https://ollama.com', icon: '🦙', categories: ['ai', 'devops'], description: 'Run LLMs locally. Llama, Mistral, Qwen, Phi, and more.', tags: ['local', 'free', 'opensource'], flags: ['free', 'opensource', 'popular'] },
        { name: 'LM Studio', url: 'https://lmstudio.ai', icon: '🏠', categories: ['ai'], description: 'Discover, download, and run local LLMs. Beautiful desktop app.', tags: ['local', 'free'], flags: ['free'] },
        { name: 'vLLM', url: 'https://docs.vllm.ai', icon: '🚀', categories: ['ai', 'devops'], description: 'High-throughput LLM serving. The standard for production inference.', tags: ['serving', 'opensource'], flags: ['opensource'] },
        { name: 'Modal', url: 'https://modal.com', icon: '🎛️', categories: ['ai', 'devops'], description: 'Run AI apps in the cloud. Serverless GPU, no infra.', tags: ['serverless', 'gpu'] },

        // ── AI ANALYTICS & BENCHMARKS (your added links) ────────────────────
        { name: 'Artificial Analysis', url: 'https://artificialanalysis.ai/leaderboards/models', icon: '📊', categories: ['ai', 'analytics'], description: 'Compare LLM performance, quality, price, and speed across providers.', tags: ['benchmark', 'llm', 'free'], flags: ['free', 'popular'] },
        { name: 'LMArena (Chatbot Arena)', url: 'https://lmarena.ai', icon: '⚔️', categories: ['ai', 'analytics'], description: 'Blind side-by-side LLM battles. The most-cited quality leaderboard.', tags: ['benchmark', 'crowdsourced', 'free', 'popular'], flags: ['free', 'popular'] },
        { name: 'WebDev Arena', url: 'https://arena.ai/leaderboard/code/webdev', icon: '🌐', categories: ['ai', 'analytics'], description: 'Arena-style leaderboard for coding LLMs on web development tasks.', tags: ['benchmark', 'coding', 'free'], flags: ['free'] },
        { name: 'SEAL Leaderboard (Scale)', url: 'https://labs.scale.com/leaderboard', icon: '🦭', categories: ['ai', 'analytics'], description: 'Scale AI\'s private, expert-graded LLM evaluations across domains.', tags: ['benchmark', 'eval', 'free'], flags: ['free'] },
        { name: 'Vellum LLM Leaderboard', url: 'https://www.vellum.ai/llm-leaderboard', icon: '📈', categories: ['ai', 'analytics'], description: 'Compare LLMs by quality, latency, and cost. Curated by Vellum.', tags: ['benchmark', 'eval'] },
        { name: 'LeanAI Leaderboard', url: 'https://leanaileaderboard.com', icon: '🏋️', categories: ['ai', 'analytics'], description: 'LLM leaderboard focused on Lean theorem proving capability.', tags: ['benchmark', 'math'] },
        { name: 'Kilo Dataset Leaderboard', url: 'https://kilo.ai/leaderboard', icon: '🥇', categories: ['ai', 'analytics'], description: 'Leaderboard for fine-tuning datasets. Find the best datasets by task.', tags: ['benchmark', 'datasets'] },
        { name: 'HF Performance Leaderboard', url: 'https://huggingface.co/spaces/ArtificialAnalysis/LLM-Performance-Leaderboard', icon: '⚡', categories: ['ai', 'analytics'], description: 'Artificial Analysis on HF Spaces. LLM latency/throughput vs. quality.', tags: ['benchmark', 'performance', 'free'], flags: ['free'] },
        { name: 'Open LLM Leaderboard', url: 'https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard', icon: '🏁', categories: ['ai', 'analytics'], description: 'The OG open-source LLM benchmark on Hugging Face.', tags: ['benchmark', 'opensource', 'free'], flags: ['free', 'opensource'] },
        { name: 'Aider Code Leaderboard', url: 'https://aider.chat/docs/leaderboards/', icon: '👨‍💻', categories: ['ai', 'analytics'], description: 'Which LLMs are best at editing code in real git repos? Benchmark.', tags: ['benchmark', 'coding', 'free'], flags: ['free'] },
        { name: 'Papers with Code SOTA', url: 'https://paperswithcode.com/sota', icon: '🎯', categories: ['ai', 'analytics'], description: 'State-of-the-art results across all ML tasks. With paper + code.', tags: ['benchmark', 'sota', 'free'], flags: ['free'] },
        { name: 'LiveBench', url: 'https://livebench.ai', icon: '🔴', categories: ['ai', 'analytics'], description: 'Continuously updated LLM benchmark. No contamination.', tags: ['benchmark', 'free'], flags: ['free'] },

        // ── FRONTEND ────────────────────────────────────────────────────────
        { name: 'CodePen', url: 'https://codepen.io', icon: '🖊️', categories: ['frontend'], description: 'Front-end playground.', tags: ['playground', 'free'], flags: ['free'] },
        { name: 'CSS-Tricks', url: 'https://css-tricks.com', icon: '🎨', categories: ['frontend', 'learning'], description: 'Daily articles about CSS, front-end techniques and best practices.', tags: ['css', 'articles', 'free'], flags: ['free'] },
        { name: 'Smashing Magazine', url: 'https://www.smashingmagazine.com', icon: '💥', categories: ['frontend', 'learning'], description: 'For web designers and developers. Books, conferences, articles.', tags: ['articles', 'popular'] },
        { name: 'Canva', url: 'https://www.canva.com', icon: '🖌️', categories: ['frontend', 'design'], description: 'Easy graphic design tool. Templates for everything.', tags: ['design', 'popular'], flags: ['popular'] },
        { name: 'Tailwind Playground', url: 'https://play.tailwindcss.com', icon: '🎮', categories: ['frontend'], description: 'Official Tailwind CSS online playground.', tags: ['tailwind', 'free'], flags: ['free'] },
        { name: 'Vue.js Docs', url: 'https://vuejs.org', icon: '💚', categories: ['frontend'], description: 'The Progressive JavaScript Framework.', tags: ['framework', 'opensource'], flags: ['opensource'] },
        { name: 'React Docs', url: 'https://react.dev', icon: '⚛️', categories: ['frontend'], description: 'Official React documentation. New hooks-first learning path.', tags: ['react', 'docs', 'free'], flags: ['free', 'popular'] },
        { name: 'Svelte', url: 'https://svelte.dev', icon: '🔥', categories: ['frontend'], description: 'Cybernetically enhanced web apps. Compile-time framework.', tags: ['framework', 'opensource'], flags: ['opensource'] },
        { name: 'Vite', url: 'https://vitejs.dev', icon: '⚡', categories: ['frontend'], description: 'Next generation frontend tooling. Instant dev server.', tags: ['build', 'opensource'], flags: ['opensource', 'popular'] },
        { name: 'Astro', url: 'https://astro.build', icon: '🚀', categories: ['frontend'], description: 'The web framework for content-driven sites. Ship less JS.', tags: ['framework', 'opensource'], flags: ['opensource'] },
        { name: 'TypeScript Handbook', url: 'https://www.typescriptlang.org/docs/handbook/intro.html', icon: '📘', categories: ['frontend', 'learning'], description: 'Official TypeScript documentation.', tags: ['typescript', 'docs', 'free'], flags: ['free'] },
        { name: 'JavaScript.info', url: 'https://javascript.info', icon: '📜', categories: ['frontend', 'learning'], description: 'Modern JavaScript Tutorial. From basics to advanced.', tags: ['javascript', 'tutorial', 'free'], flags: ['free'] },

        // ── DEVOPS ──────────────────────────────────────────────────────────
        { name: 'Docker Hub', url: 'https://hub.docker.com', icon: '🐳', categories: ['devops'], description: 'Container image registry. Millions of images.', tags: ['containers', 'popular'], flags: ['popular'] },
        { name: 'Cloudflare', url: 'https://www.cloudflare.com', icon: '☁️', categories: ['devops', 'api'], description: 'CDN, DNS, edge compute, R2 storage, Workers. Free tier is generous.', tags: ['cdn', 'edge', 'popular'], flags: ['popular'] },
        { name: 'Vercel', url: 'https://vercel.com', icon: '▲', categories: ['devops', 'frontend'], description: 'Deploy frontend apps in seconds. From the Next.js team.', tags: ['hosting', 'nextjs', 'popular'], flags: ['popular'] },
        { name: 'Netlify', url: 'https://www.netlify.com', icon: '🌐', categories: ['devops', 'frontend'], description: 'Deploy modern web apps. Git-based workflow.', tags: ['hosting'] },
        { name: 'Railway', url: 'https://railway.app', icon: '🚂', categories: ['devops'], description: 'Infrastructure platform. Bring your code, deploy in minutes.', tags: ['hosting', 'paas'] },
        { name: 'Render', url: 'https://render.com', icon: '🎞️', categories: ['devops'], description: 'Cloud platform for web apps and databases. Heroku alternative.', tags: ['hosting', 'paas'] },
        { name: 'Fly.io', url: 'https://fly.io', icon: '🪰', categories: ['devops'], description: 'Run full-stack apps near your users. Global anycast.', tags: ['hosting', 'edge'] },
        { name: 'Supabase', url: 'https://supabase.com', icon: '⚡', categories: ['devops', 'data', 'api'], description: 'Open-source Firebase alternative. Postgres, auth, storage, realtime.', tags: ['postgres', 'baas', 'opensource', 'popular'], flags: ['opensource', 'popular'] },
        { name: 'PlanetScale', url: 'https://planetscale.com', icon: '🪐', categories: ['devops', 'data'], description: 'Serverless MySQL platform. Built on Vitess.', tags: ['mysql', 'serverless'] },
        { name: 'Neon', url: 'https://neon.tech', icon: '🟢', categories: ['devops', 'data'], description: 'Serverless Postgres. Branch your database like code.', tags: ['postgres', 'serverless'] },
        { name: 'Upstash', url: 'https://upstash.com', icon: '🔼', categories: ['devops', 'data'], description: 'Serverless Redis and Kafka. Pay per request.', tags: ['redis', 'serverless'] },
        { name: 'Plausible', url: 'https://plausible.io', icon: '📈', categories: ['devops', 'analytics'], description: 'Lightweight, privacy-friendly analytics. No cookies.', tags: ['analytics', 'opensource'], flags: ['opensource'] },
        { name: 'UptimeRobot', url: 'https://uptimerobot.com', icon: '🤖', categories: ['devops'], description: 'Free uptime monitoring. 50 monitors free.', tags: ['monitoring', 'free'], flags: ['free'] },
        { name: 'Sentry', url: 'https://sentry.io', icon: '👁️', categories: ['devops'], description: 'Application monitoring and error tracking.', tags: ['monitoring', 'errors', 'popular'], flags: ['popular'] },
        { name: 'Grafana', url: 'https://grafana.com', icon: '📊', categories: ['devops', 'analytics'], description: 'Open-source dashboards and observability platform.', tags: ['monitoring', 'opensource'], flags: ['opensource'] },
        { name: 'Prometheus', url: 'https://prometheus.io', icon: '🔥', categories: ['devops'], description: 'Open-source monitoring and alerting toolkit.', tags: ['monitoring', 'opensource'], flags: ['opensource'] },
        { name: 'k9s', url: 'https://k9scli.io', icon: '🐕', categories: ['devops'], description: 'Terminal UI for Kubernetes. Dev-favorite.', tags: ['k8s', 'opensource'], flags: ['opensource'] },
        { name: 'SSL Labs', url: 'https://www.ssllabs.com/ssltest/', icon: '🔒', categories: ['devops'], description: 'Test your site\'s SSL/TLS configuration.', tags: ['security', 'free'], flags: ['free'] },

        // ── LEARNING ────────────────────────────────────────────────────────
        { name: 'freeCodeCamp', url: 'https://www.freecodecamp.org', icon: '🔥', categories: ['learning'], description: 'Free coding curriculum with certifications. Tens of thousands of learners.', tags: ['course', 'free', 'popular'], flags: ['free', 'popular'] },
        { name: 'The Odin Project', url: 'https://www.theodinproject.com', icon: '🛡️', categories: ['learning'], description: 'Free full-stack curriculum (Ruby/Rails, Node). Project-based.', tags: ['course', 'free', 'opensource'], flags: ['free', 'opensource'] },
        { name: 'Frontend Masters', url: 'https://frontendmasters.com', icon: '🎓', categories: ['learning'], description: 'Expert-led courses on JS, CSS, TS, React, Node.', tags: ['course', 'paid'], flags: ['paid'] },
        { name: 'Egghead', url: 'https://egghead.io', icon: '🥚', categories: ['learning'], description: 'Concise screencasts for web developers.', tags: ['course'] },
        { name: 'Coursera', url: 'https://www.coursera.org', icon: '🏛️', categories: ['learning'], description: 'University courses online. Specializations in CS, ML, etc.', tags: ['course', 'popular'], flags: ['popular'] },
        { name: 'Udemy', url: 'https://www.udemy.com', icon: '🎯', categories: ['learning'], description: 'Largest catalog of online courses. Quality varies—check reviews.', tags: ['course', 'popular'], flags: ['popular'] },
        { name: 'YouTube (Fireship)', url: 'https://www.youtube.com/@Fireship', icon: '🔥', categories: ['learning', 'coding'], description: '100-seconds-of-code overviews and deep-ish dives. Funny, fast.', tags: ['video', 'free', 'popular'], flags: ['free', 'popular'] },
        { name: 'YouTube (ThePrimeagen)', url: 'https://www.youtube.com/@ThePrimeagen', icon: '🎮', categories: ['learning', 'community'], description: 'Vim, algorithms, dev rants. Entertaining + educational.', tags: ['video', 'free'], flags: ['free'] },
        { name: 'Anna\'s Archive', url: 'https://annas-archive.gd', icon: '📚', categories: ['learning'], description: 'Open-source books, papers, and articles. Largest shadow library.', tags: ['books', 'papers'] },
        { name: 'Project Gutenberg', url: 'https://www.gutenberg.org', icon: '📖', categories: ['learning'], description: '70,000+ free public-domain ebooks.', tags: ['books', 'free'], flags: ['free'] },
        { name: 'O\'Reilly Learning', url: 'https://www.oreilly.com', icon: '🐾', categories: ['learning'], description: 'Tech books, video courses, live online training.', tags: ['books', 'paid'], flags: ['paid'] },
        { name: 'LibriVox', url: 'https://librivox.org', icon: '🎧', categories: ['learning'], description: 'Free public-domain audiobooks.', tags: ['audio', 'free'], flags: ['free'] },

        // ── DATA & DB ───────────────────────────────────────────────────────
        { name: 'DB-Engines', url: 'https://db-engines.com', icon: '🗄️', categories: ['data', 'analytics'], description: 'Ranking and comparison of 400+ database systems.', tags: ['databases', 'free'], flags: ['free'] },
        { name: 'Crunchbase', url: 'https://www.crunchbase.com', icon: '🥁', categories: ['data', 'startup'], description: 'Public company data: funding, founders, competitors.', tags: ['business'] },
        { name: 'Kaggle Datasets', url: 'https://www.kaggle.com/datasets', icon: '📊', categories: ['data'], description: 'Tens of thousands of free datasets.', tags: ['datasets', 'free'], flags: ['free'] },
        { name: 'Awesome Public Datasets', url: 'https://github.com/awesomedata/awesome-public-datasets', icon: '🎁', categories: ['data'], description: 'Topic-centric list of high-quality public datasets.', tags: ['datasets', 'free', 'opensource'], flags: ['free', 'opensource'] },
        { name: 'Dataset List', url: 'https://datasetlist.com', icon: '📋', categories: ['data'], description: '1000+ free datasets by topic.', tags: ['datasets', 'free'], flags: ['free'] },
        { name: 'DrawSQL', url: 'https://drawsql.app', icon: '✏️', categories: ['data', 'design'], description: 'Visual database schema designer.', tags: ['schema', 'free'], flags: ['free'] },

        // ── API & SERVICES ──────────────────────────────────────────────────
        { name: 'Public APIs', url: 'https://github.com/public-apis/public-apis', icon: '🌐', categories: ['api'], description: 'A collective list of free APIs for use in software and web dev.', tags: ['apis', 'free', 'opensource', 'popular'], flags: ['free', 'opensource', 'popular'] },
        { name: 'RapidAPI', url: 'https://rapidapi.com', icon: '🔌', categories: ['api'], description: 'World\'s largest API hub. Discover, test, and connect.', tags: ['apis', 'popular'], flags: ['popular'] },
        { name: 'Postman', url: 'https://www.postman.com', icon: '✉️', categories: ['api'], description: 'API platform for building and using APIs. Industry standard.', tags: ['testing', 'popular'], flags: ['popular'] },
        { name: 'Insomnia', url: 'https://insomnia.rest', icon: '😴', categories: ['api'], description: 'Open-source API client. Postman alternative.', tags: ['testing', 'opensource'], flags: ['opensource'] },
        { name: 'Stripe Docs', url: 'https://stripe.com/docs', icon: '💳', categories: ['api'], description: 'The gold standard for API documentation.', tags: ['payments', 'docs', 'popular'], flags: ['popular'] },
        { name: 'Twilio', url: 'https://www.twilio.com', icon: '☎️', categories: ['api'], description: 'Programmable SMS, voice, video, messaging.', tags: ['communications'] },

        // ── PRODUCTIVITY ────────────────────────────────────────────────────
        { name: 'Notion', url: 'https://www.notion.so', icon: '📝', categories: ['productivity'], description: 'All-in-one workspace for notes, docs, wikis, projects.', tags: ['notes', 'popular'], flags: ['popular'] },
        { name: 'Linear', url: 'https://linear.app', icon: '📐', categories: ['productivity'], description: 'The issue-tracking tool developers actually enjoy using.', tags: ['issues', 'popular'], flags: ['popular'] },
        { name: 'Raycast', url: 'https://www.raycast.com', icon: '🚀', categories: ['productivity'], description: 'Blazing-fast macOS launcher. Replace Spotlight.', tags: ['macos', 'launcher'] },
        { name: 'Tana', url: 'https://tana.io', icon: '🌳', categories: ['productivity'], description: 'AI-first knowledge management with supertags.', tags: ['knowledge'] },
        { name: 'Obsidian', url: 'https://obsidian.md', icon: '💠', categories: ['productivity'], description: 'Markdown-based knowledge base on local files.', tags: ['notes', 'offline'] },
        { name: 'Cron / Notion Calendar', url: 'https://www.notion.so/product/calendar', icon: '📅', categories: ['productivity'], description: 'Fast, beautiful calendar. Now part of Notion.', tags: ['calendar'] },
        { name: 'Tldraw', url: 'https://www.tldraw.com', icon: '✏️', categories: ['productivity', 'design'], description: 'Infinite canvas. AI-assisted drawing and whiteboard.', tags: ['whiteboard', 'opensource'], flags: ['opensource'] },
        { name: 'Excalidraw', url: 'https://excalidraw.com', icon: '🖍️', categories: ['productivity', 'design'], description: 'Virtual whiteboard for sketching hand-drawn diagrams.', tags: ['whiteboard', 'opensource', 'free'], flags: ['opensource', 'free', 'popular'] },

        // ── COMMUNITY ───────────────────────────────────────────────────────
        { name: 'Hacker News', url: 'https://news.ycombinator.com', icon: '🟧', categories: ['community'], description: 'News and discussion for hackers. The most influential tech forum.', tags: ['news', 'popular'], flags: ['popular'] },
        { name: 'Reddit /r/programming', url: 'https://www.reddit.com/r/programming', icon: '👽', categories: ['community'], description: 'General programming discussion.', tags: ['news'] },
        { name: 'Indie Hackers', url: 'https://www.indiehackers.com', icon: '🚀', categories: ['community', 'startup'], description: 'Community of founders funding their own startups.', tags: ['startups'] },
        { name: 'Product Hunt', url: 'https://www.producthunt.com', icon: '🐱', categories: ['community', 'startup'], description: 'The place to launch and discover new products.', tags: ['launch', 'popular'], flags: ['popular'] },
        { name: 'Dev.to', url: 'https://dev.to', icon: '👩‍💻', categories: ['community', 'learning'], description: 'Community of programmers writing articles for each other.', tags: ['blog', 'free'], flags: ['free'] },
        { name: 'Lobsters', url: 'https://lobste.rs', icon: '🦞', categories: ['community'], description: 'Computing-focused link aggregator. Invite-only, high quality.', tags: ['news'] },
        { name: 'CSS-Tricks articles', url: 'https://css-tricks.com/articles/', icon: '📰', categories: ['community', 'frontend'], description: 'Front-end articles, news, and snippets.', tags: ['news', 'free'], flags: ['free'] },

        // ── STARTUP (your added link) ───────────────────────────────────────
        { name: 'Y Combinator Companies', url: 'https://www.ycombinator.com/companies', icon: '🎓', categories: ['startup', 'analytics'], description: 'Directory of every YC-backed company. Filter by batch, industry, stage.', tags: ['directory', 'free', 'popular'], flags: ['free', 'popular'] },
        { name: 'AppFigures Leaderboards', url: 'https://appfigures.com/reports/leaderboards', icon: '📲', categories: ['analytics', 'startup'], description: 'Top apps by category, country, and store. Market intelligence.', tags: ['apps', 'market', 'free'], flags: ['free'] },
        { name: 'AngelList / Wellfound', url: 'https://wellfound.com', icon: '😇', categories: ['startup', 'community'], description: 'Startup jobs, companies, and funding data.', tags: ['jobs', 'startups'] },
        { name: 'Crunchbase News', url: 'https://news.crunchbase.com', icon: '📰', categories: ['startup', 'analytics'], description: 'Funding rounds, M&A, and startup market analysis.', tags: ['business', 'news'] },
        { name: 'PitchBook', url: 'https://pitchbook.com', icon: '📖', categories: ['startup', 'analytics'], description: 'Comprehensive VC, PE, and M&A data.', tags: ['business', 'paid'], flags: ['paid'] },
        { name: 'TechCrunch', url: 'https://techcrunch.com', icon: '📰', categories: ['startup', 'community'], description: 'Startup and tech news.', tags: ['news', 'popular'], flags: ['popular'] },
        { name: 'First Round Review', url: 'https://review.firstround.com', icon: '🔄', categories: ['startup', 'learning'], description: 'Long-form articles on building startups from First Round Capital.', tags: ['articles'] },
        { name: 'a16z', url: 'https://a16z.com', icon: '💠', categories: ['startup', 'learning'], description: 'Andreessen Horowitz\'s essays on tech, AI, and startups.', tags: ['vc', 'essays'] },
        { name: 'Paul Graham Essays', url: 'https://paulgraham.com/articles.html', icon: '✍️', categories: ['startup', 'learning'], description: 'Essays on startups, programming, and life by PG. Foundational.', tags: ['essays', 'free', 'popular'], flags: ['free', 'popular'] },
        { name: 'Stratechery', url: 'https://stratechery.com', icon: '♟️', categories: ['startup', 'learning'], description: 'Ben Thompson on tech strategy and business models.', tags: ['strategy', 'paid'], flags: ['paid'] },
        { name: 'IndieHackers Milestones', url: 'https://www.indiehackers.com/milestones', icon: '🎯', categories: ['startup', 'community'], description: 'Real revenue milestones from indie founders. Validate ideas.', tags: ['startups', 'free'], flags: ['free'] },
        { name: 'Acquiring.com', url: 'https://acquiring.com', icon: '💰', categories: ['startup'], description: 'Buy and sell micro-SaaS businesses.', tags: ['acquisitions'] },
        { name: 'MicroConf', url: 'https://microconf.com', icon: '🔬', categories: ['startup', 'community'], description: 'Community for bootstrapped SaaS founders.', tags: ['community'] },

        // ── ANALYTICS (general) ─────────────────────────────────────────────
        { name: 'Google Trends', url: 'https://trends.google.com', icon: '📈', categories: ['analytics'], description: 'See what\'s trending in search. Compare terms over time.', tags: ['trends', 'free', 'popular'], flags: ['free', 'popular'] },
        { name: 'Statista', url: 'https://www.statista.com', icon: '📊', categories: ['analytics', 'data'], description: 'Market and consumer data. 1M+ statistics.', tags: ['market', 'paid'], flags: ['paid'] },
        { name: 'Similarweb', url: 'https://www.similarweb.com', icon: '🪞', categories: ['analytics'], description: 'Website traffic and competitor analysis.', tags: ['traffic'] },
        { name: 'BuiltWith', url: 'https://builtwith.com', icon: '🛠️', categories: ['analytics'], description: 'See what tech stack any website is built with.', tags: ['tech-stack', 'free'], flags: ['free'] },
        { name: 'Wappalyzer', url: 'https://www.wappalyzer.com', icon: '🔍', categories: ['analytics'], description: 'Instant tech stack lookup. Browser extension available.', tags: ['tech-stack', 'free'], flags: ['free'] },
    ];

    // ---- RENDER STATE -------------------------------------------------------

    const state = {
        category: 'all',
        search: '',
    };

    const $ = (id) => document.getElementById(id);

    function esc(s) {
        if (s === null || s === undefined) return '';
        const d = document.createElement('div');
        d.textContent = String(s);
        return d.innerHTML;
    }

    function faviconFor(url) {
        try {
            const u = new URL(url);
            return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=64`;
        } catch { return ''; }
    }

    // ---- compute counts per category ---------------------------------------

    function buildCounts() {
        const counts = { all: RESOURCES.length };
        for (const r of RESOURCES) {
            for (const c of r.categories) {
                counts[c] = (counts[c] || 0) + 1;
            }
        }
        return counts;
    }

    // ---- render: stats ------------------------------------------------------

    function renderStats() {
        const counts = buildCounts();
        const totalCats = Object.keys(counts).filter(k => k !== 'all').length;
        $('dr-stats').innerHTML = `
            <div class="dr-stat"><div class="dr-stat-val">${RESOURCES.length}</div><div class="dr-stat-lbl">resources</div></div>
            <div class="dr-stat"><div class="dr-stat-val">${totalCats}</div><div class="dr-stat-lbl">categories</div></div>
            <div class="dr-stat"><div class="dr-stat-val">${counts.design || 0}</div><div class="dr-stat-lbl">design</div></div>
            <div class="dr-stat"><div class="dr-stat-val">${counts.ai || 0}</div><div class="dr-stat-lbl">ai &amp; ml</div></div>
        `;
    }

    // ---- render: tab counts -------------------------------------------------

    function renderTabCounts() {
        const counts = buildCounts();
        document.querySelectorAll('.dr-tab').forEach(btn => {
            const cat = btn.dataset.cat;
            const n = counts[cat] || 0;
            const span = btn.querySelector('.cnt');
            if (span) span.textContent = `(${n})`;
        });
    }

    // ---- render: favorite strip --------------------------------------------

    const FAVORITES = ['github.com', 'huggingface.co', 'news.ycombinator.com', 'developer.mozilla.org', 'stackoverflow.com', 'tailwindcss.com', 'figma.com', 'openrouter.ai'];

    function renderFavorites() {
        const favs = RESOURCES.filter(r => {
            try { return FAVORITES.includes(new URL(r.url).hostname); } catch { return false; }
        });
        $('dr-fav').innerHTML = `<span style="color:var(--text-muted);font-size:0.78rem;font-weight:700;align-self:center">⚡ Quick access:</span>` +
            favs.map(r => `<a class="dr-fav" href="${esc(r.url)}" target="_blank" rel="noopener"><span>${r.icon}</span><span>${esc(r.name)}</span></a>`).join('');
    }

    // ---- render: grid ------------------------------------------------------

    function matchesSearch(r, q) {
        if (!q) return true;
        const hay = [r.name, r.description, ...(r.tags || []), ...(r.categories || [])]
            .join(' ').toLowerCase();
        return q.split(/\s+/).every(t => hay.includes(t));
    }

    function flagLabel(f) {
        return { free: 'free', paid: 'paid', popular: '★ popular', opensource: 'open-source' }[f] || f;
    }

    function flagClass(f) {
        return { free: 'free', paid: 'paid', popular: 'popular', opensource: 'opensource' }[f] || '';
    }

    function renderCard(r) {
        const flagHtml = (r.flags || []).map(f =>
            `<span class="dr-item-tag ${flagClass(f)}">${esc(flagLabel(f))}</span>`
        ).join('');
        const tagHtml = (r.tags || []).slice(0, 5).map(t =>
            `<span class="dr-item-tag">${esc(t)}</span>`
        ).join('');
        return `
            <div class="dr-item">
                <div class="dr-item-head">
                    <a class="dr-item-name" href="${esc(r.url)}" target="_blank" rel="noopener">${r.icon} ${esc(r.name)}</a>
                </div>
                <div class="dr-item-desc">${esc(r.description)}</div>
                <div class="dr-item-tags">${flagHtml}${tagHtml}</div>
            </div>
        `;
    }

    function renderGrid() {
        const q = state.search.trim().toLowerCase();
        const cat = state.category;
        const filtered = RESOURCES
            .filter(r => cat === 'all' || r.categories.includes(cat))
            .filter(r => matchesSearch(r, q))
            .slice(0, MAX_PER_CAT);

        $('dr-count').textContent = `${filtered.length} shown`;

        if (!filtered.length) {
            $('dr-grid').innerHTML = '<div class="dr-empty">No resources match. Try a different search or category.</div>';
            return;
        }
        $('dr-grid').innerHTML = filtered.map(renderCard).join('');
    }

    function setActiveCategory(cat) {
        state.category = cat;
        document.querySelectorAll('.dr-tab').forEach(b => {
            b.classList.toggle('active', b.dataset.cat === cat);
        });
        renderGrid();
    }

    // ---- bootstrap ----------------------------------------------------------

    function bindControls() {
        document.querySelectorAll('.dr-tab').forEach(btn => {
            btn.addEventListener('click', () => setActiveCategory(btn.dataset.cat));
        });
        $('dr-search').addEventListener('input', (e) => {
            state.search = e.target.value;
            renderGrid();
        });
        const backBtn = $('back-to-top');
        if (backBtn) {
            window.addEventListener('scroll', () => {
                backBtn.hidden = window.scrollY < 600;
            });
            backBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        renderStats();
        renderTabCounts();
        renderFavorites();
        renderGrid();
        bindControls();
    });
})();
