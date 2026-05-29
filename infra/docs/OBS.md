# OBS workflows (BPC)

## Browser sources

Add one browser source per overlay route (`/draft`, `/game`, `/lowerthird`, ...). Use fixed **1920x1080**.

## WebSocket bridge

OBS WebSocket 5 defaults to port **4455**. From EC2, reach caster via **VPN (Tailscale / WireGuard)** or a **LAN relay**; do not expose OBS WS publicly without hardened tunnel + IP allowlisting.

## REST to OBS mapping

- `POST /api/obs/connect` — websocket session
- `POST /api/obs/program-scene` — program scene cut (`SetCurrentProgramScene`)
- `POST /api/obs/scene-source` — toggle `SetSceneItemEnabled` for GFX without swapping scenes

