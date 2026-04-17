# Blue Collar Techy

Personal brand site for Nick Conley. Practical tech, AI, and local SEO for blue-collar business owners.

**Live:** [bluecollartechy.com](https://bluecollartechy.com)

## Stack

- Static HTML/CSS (no framework)
- Deployed on Cloudflare Pages
- Fonts: Archivo Black + JetBrains Mono (via Google Fonts)

## Structure

```
/
├── index.html              Homepage
├── about.html              About Nick / founder story
├── work-with-me.html       Contact form
├── under-construction.html Placeholder (now unused in nav)
├── logos/                  Brand SVGs (TS7 system)
├── youtube-scripts/        Scripts for BCT YouTube episodes
├── blog/                   Blog
│   ├── index.html          Post listing
│   └── *.html              Individual posts
├── market-scan/            Free market demand scan (lead magnet)
│   └── index.html          Form page
└── functions/
    └── api/
        └── scan.js         Cloudflare Pages Function — runs the scan
```

See `DEPLOY.md` for environment variables and the Resend + DataForSEO + GHL setup required for the market scan tool.

## Dev

```bash
# Local server
python3 -m http.server 4321
# Open http://localhost:4321/
```

## Deploy

Cloudflare Pages auto-deploys on push to `main`.

## Brand

- Primary dark: `#0d0d12`
- Accent orange: `#ff6a1a`
- Display: Archivo Black
- Body: Archivo
- Mono: JetBrains Mono
