#!/usr/bin/env bash
# Keeps a Cloudflare quick tunnel to the local API alive and records its current public URL in outputs/tunnel_url.txt.
# A manual debugging tool: nothing reads that file, so paste the URL into the app's Settings page by hand.
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
LOG=outputs/tunnel.log; URLFILE=outputs/tunnel_url.txt
while true; do
  until curl -sf localhost:8000/health >/dev/null; do sleep 5; done
  : > "$LOG"
  cloudflared tunnel --url http://localhost:8000 --no-autoupdate >> "$LOG" 2>&1 &
  PID=$!
  URL=""
  for i in $(seq 1 60); do URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | head -1); [ -n "$URL" ] && break; sleep 1; done
  if [ -n "$URL" ] && [ "$URL" != "$(cat "$URLFILE" 2>/dev/null)" ]; then
    echo "$URL" > "$URLFILE"; echo "$(date) tunnel url -> $URL" >> outputs/tunnel_events.log
  fi
  wait $PID; echo "$(date) cloudflared exited, restarting" >> outputs/tunnel_events.log; sleep 5
done
