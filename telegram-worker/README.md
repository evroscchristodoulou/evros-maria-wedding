# Evros & Maria — Telegram wedding notifications

Bot: https://t.me/emwedding2028_bot

## Security first
The original bot token was visible in a screenshot. Revoke it in @BotFather with `/revoke` before using this backend. **Never commit a token or admin secret to GitHub.**

## Deploy (Cloudflare Workers + KV)
1. Create a free Cloudflare account and install Node.js locally.
2. From this folder run `npx wrangler login` and `npx wrangler kv namespace create SUBSCRIBERS`.
3. Copy the namespace ID into `wrangler.toml`.
4. Run `npx wrangler secret put TELEGRAM_BOT_TOKEN` and paste the **new** token.
5. Run `npx wrangler secret put TELEGRAM_WEBHOOK_SECRET` and enter a randomly generated secret containing only A-Z, a-z, 0-9, underscore or hyphen.
6. Run `npx wrangler secret put ADMIN_SECRET` and enter a different, long random secret.
7. Run `npx wrangler deploy` and note your Worker URL.
8. Register the webhook from your own machine, substituting values. Do not paste secrets in a public URL or GitHub:
   ```bash
   curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
     -d "url=https://YOUR-WORKER.workers.dev/telegram/webhook" \
     -d "secret_token=$TELEGRAM_WEBHOOK_SECRET"
   ```
9. Open https://t.me/emwedding2028_bot and press Start. You should receive a welcome message.

## Send an announcement
Call the protected endpoint from your local computer (not from GitHub Pages):
```bash
curl -X POST "https://YOUR-WORKER.workers.dev/admin/send" \
  -H "Authorization: Bearer $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  --data '{"message":"❤️ Wedding update: Evros & Maria — 10 June 2028"}'
```
The backend stores subscriber Telegram chat IDs in Cloudflare KV. Users may unsubscribe using /stop. Do not expose /admin/send credentials in browser JavaScript. This simple endpoint is intended for a small wedding guest list; for large broadcasts, add rate limiting and queued sending. GitHub Pages cannot host this server component.
