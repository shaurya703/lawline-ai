#!/usr/bin/env bash
# Keeps a Cloudflare quick tunnel to the local API alive. Whenever the public URL changes, it updates the
# GitHub repo variable VITE_API_BASE and re-runs the Pages workflow so the hosted front-end follows it.
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
    : # frontend now points at the permanent Modal URL; the tunnel is only a manual debugging tool
  fi
  wait $PID; echo "$(date) cloudflared exited, restarting" >> outputs/tunnel_events.log; sleep 5
done
