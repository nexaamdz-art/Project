# AstraMind — The Living Notebook

Bilingual (AR/EN) website for the AstraMind Science & Innovation Club, ENS Béjaïa.
Single-page site (`index.html`) + admin panel (`public/admin.html`) + optional Supabase backend.

## Run locally
```bash
npm install
npm run dev      # http://localhost:3000  (admin: /admin.html)
npm run build    # outputs dist/
```

## Publish on GitHub
```bash
git init && git add . && git commit -m "AstraMind v4"
git branch -M main
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```
Then: **Settings → Pages → Source: GitHub Actions**. The workflow in `.github/workflows/deploy.yml` builds and deploys automatically.

## Import into Google AI Studio
Build → **Import from GitHub** → select the repo. `metadata.json` and `package.json` are already set up.

## Structure
- `public/assets/kit/` — real scrapbook pieces (tape, pins, polaroids, seal, notebook…)
- `public/assets/sections/` — photos of ENS Béjaïa and club activities
- `public/data.js` — events & gallery (demo mode); `public/config.js` — site config
- `supabase/` + `SETUP-SUPABASE.txt` / `SETUP-RESEND.txt` — optional backend setup

> Never commit private keys. Only the Supabase **anon** key belongs in `public/supabase-config.js`.
