# Bet Tracker

Track bets, deposits, withdrawals, and P&L across multiple platforms.

## Features
- Bet-by-bet P&L tracking with win/loss/pending status
- PrizePicks (power play, flex play) and Robinhood (prediction markets) support
- Add unlimited custom platforms
- Betslip scanner — upload a screenshot, auto-fill bet details via Claude API
- Deposit/withdrawal tracking
- Weekly and monthly P&L charts
- Export/import data backups
- Installable as a mobile app (PWA)

## Quick Deploy (free, ~10 minutes)

### Option A: Vercel (recommended)
1. Install Node.js from https://nodejs.org (LTS version)
2. Create a free GitHub account if you don't have one
3. Create a new repo and push this folder to it:
   ```bash
   cd bet-tracker
   git init
   git add .
   git commit -m "initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/bet-tracker.git
   git push -u origin main
   ```
4. Go to https://vercel.com and sign in with GitHub
5. Click "Add New Project" → select your bet-tracker repo
6. Click "Deploy" — done! You'll get a URL like `bet-tracker.vercel.app`

### Option B: Run locally
```bash
cd bet-tracker
npm install
npm run dev
```
Opens at http://localhost:5173

## Install on your phone
1. Open your deployed URL in Safari (iPhone) or Chrome (Android)
2. **iPhone**: tap the Share button → "Add to Home Screen"
3. **Android**: tap the three-dot menu → "Add to Home Screen" or "Install app"
4. It now works like a native app with its own icon

## Betslip Scanner Setup
1. Get an API key from https://console.anthropic.com/settings/keys
2. In the app, go to Settings → paste your key
3. Tap "Scan betslip" on the Bets tab to upload a screenshot

## Syncing Between Devices
For now, use Settings → Export/Import to transfer data between devices.
For automatic sync, you'd add a backend like Supabase (free tier):
- supabase.com → create project → use their JS client to sync localStorage

## Tech Stack
- React 18 + Vite
- localStorage for data persistence
- PWA (Progressive Web App) for mobile install
- Anthropic Claude API for betslip scanning
