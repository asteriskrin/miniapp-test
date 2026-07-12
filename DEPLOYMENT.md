# DEPLOYMENT — telegram-miniapp

Static HTML/JS frontend for the BlockLiquidity Telegram mini-app. Each alert type
is a standalone page (e.g. `new_trade_alert.html`, `track_trade_direction_alert.html`,
`liquidation_alert.html`) opened by **bl-telegram-bot** as a Telegram WebApp. The
page collects input and returns it to the bot via `Telegram.WebApp.sendData(...)`;
the bot forwards it to **bl-alert-manager**.

## Where it runs
- **Host / platform:** GitHub Pages (static hosting). No server, no datastore.
- **Public URL:** `https://blockliquidity.github.io/telegram-miniapp/` (per-page,
  e.g. `.../new_trade_alert.html`). These URLs are configured as the WebApp URLs in
  bl-telegram-bot.
- **Run-as / ports:** none (static assets served by GitHub Pages CDN).
- **External services called from the browser:** the Hyperliquid public info API
  (`https://api.hyperliquid.xyz/info`) via `token-fetcher.js` to populate token
  pickers; `https://telegram.org/js/telegram-web-app.js` for the Telegram WebApp SDK.

## How it runs
- Pure static files. No process manager, no build step (plain HTML/CSS/vanilla JS).
- To preview locally, serve the repo root over HTTP, e.g. `python3 -m http.server 8000`
  then open `http://localhost:8000/new_trade_alert.html`. Pages fall back to a
  console/`alert()` "simulated send" when opened outside Telegram
  (`tg.initDataUnsafe.user` is absent).

## How to deploy
- **CI:** `.github/workflows/static.yml` — on every push to `main` (or manual
  `workflow_dispatch`), it uploads the entire repo and deploys to GitHub Pages via
  `actions/deploy-pages`.
- **Procedure:** merge the change to `main` → the Pages workflow publishes
  automatically (usually < 1–2 min).
- **Verify:** open the deployed page URL in a browser (hard-refresh to bypass CDN
  cache) and confirm the new UI/behaviour; or open it from the bot in Telegram and
  complete a submission end-to-end. Check the Actions tab for a green "Deploy static
  content to Pages" run.
- **Rollback:** revert the offending commit on `main` (or re-run the workflow from a
  previous good commit) — Pages re-publishes the reverted content. There is no build
  artifact to manage.

## Dependencies & prerequisites
- No runtime/toolchain needed to build (static files).
- GitHub Pages must be enabled for the repo with the source set to "GitHub Actions".
- The bot's WebApp URLs must point at the deployed Pages URLs.

## Notes
- **Token symbols must match `node_events:fills` exactly.** Token pickers submit the
  canonical Hyperliquid coin symbol from `token-fetcher.js` (perps bare e.g. `BTC`;
  HIP-3 perps namespaced e.g. `xyz:GOOGL`), because notification-core filters alerts
  by an exact string match on `fill.coin`. Do not substitute display names.
