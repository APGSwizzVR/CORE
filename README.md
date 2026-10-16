# CORE

CORE is a Windows-first community chat app with a quieter, more considered take on the familiar server, channel, and conversation layout. Its UI uses an original CORE identity, a soft pointer-following violet light, compact transitions, and the Windows system UI font stack (Segoe UI Variable on supported Windows versions; Apple system fonts only when running on Apple platforms).

CORE has no premium tier, billing flow, or paid communication features.

## What works in this build

- Accounts, sign-in/out, salted password hashing, profile details, avatar/banner image crop, presence states, and accent themes.
- Spaces with custom names, descriptions, cropped icons and banners; random 8-character invite codes with use caps and expiry, direct friend invitations, acceptance, and revocation.
- Text and voice channels with categories, topics, private member access, and text slow mode. Private-channel access is checked by the HTTP API and live Socket.IO rooms.
- Owner/admin/member space roles, member lists, role changes, and message reports with a moderator review queue.
- Live server chat and one-to-one DMs, group DMs (up to ten people), message edits/deletion, reactions, threads, pins, polls, history search with author/date/attachment filters, and attachment previews.
- Scheduled space events with channel locations and live RSVPs.
- Built-in emojis, stickers, and local soundboard playback; admins can upload, preview, and remove space-specific emoji, sticker, and sound assets.
- Microphone calls, camera video, screen/window sharing, mute/deafen, device selectors, camera quality, push-to-talk, connection state, and a dedicated Windows screen/window picker.
- Crop, zoom, reposition, and preview JPG/PNG/WebP profile and space art. Image and file type/size validation runs on the server as well as in the interface.
- Message formatting for bold, italic, strike-through, inline/fenced code, headings, lists, quotes, links, spoilers, and uploaded space emoji/stickers.
- Clickable chat avatars open a compact profile card with the person’s avatar, banner, handle, bio, and live presence.

## Run CORE on Windows

Requirements: Node.js 24 and npm.

```powershell
npm ci
npm run dev
```

The development command starts the Vite interface and the local CORE service. Local accounts, messages, and uploads are stored under Electron's per-user application data directory.

To make a Windows installer locally:

```powershell
npm ci
npm run package:win
```

The x64 NSIS installer is written to `release/`. It is currently unsigned; Windows SmartScreen may show a publisher warning.

## Shared server setup

The desktop app is local-first. To share accounts and conversations across computers, host the CORE service on a reachable machine and enter its HTTPS address from **Server setup** on each app's sign-in screen. Put the service behind HTTPS and a reverse proxy that supports WebSocket upgrades before exposing it to the internet.

For a Node deployment:

```powershell
Copy-Item .env.example .env
npm ci
npm run server
```

Docker Compose is also included:

```powershell
Copy-Item .env.example .env
docker compose up --build -d
```

Set `CORE_PUBLIC_URL` to the public HTTPS address so generated invites work for invitees. Set `CORE_DATA_DIR` to persistent storage. The JSON file and uploaded assets should be backed up together. Never commit `.env` or put `CORE_TURN_SECRET` in a desktop build.

### Configuration

| Variable | Purpose |
| --- | --- |
| `VITE_CORE_SERVER_URL` | Optional shared server URL embedded at build time. Usually leave blank so each user can enter a server from the sign-in screen. |
| `PORT` | Standalone service port; default `4179`. |
| `CORE_BIND_ADDRESS` | Standalone service bind address; default `0.0.0.0`. Use `127.0.0.1` behind a local reverse proxy. |
| `CORE_PUBLIC_URL` | Public HTTPS origin used to create invite links. |
| `CORE_ALLOWED_ORIGINS` | Comma-separated allowed web/Socket.IO origins. |
| `CORE_DATA_DIR` | Persistent JSON database and upload directory. |
| `CORE_STUN_URLS` | Comma-separated STUN URLs; defaults to Google's public STUN service. |
| `CORE_TURN_URLS` | Optional TURN relay URLs for networks where direct peer connections fail. |
| `CORE_TURN_SECRET` | Optional coturn REST shared secret; used by the service to issue short-lived TURN credentials. Keep it on the server only. |

`.env.example` contains placeholders only. Do not use a development HTTP address for a public deployment; HTTPS is required for safe remote use and browser media permissions.

## Architecture

- **Desktop:** Electron with context isolation, renderer sandboxing, Node integration disabled, scoped media permission handling, and a preload bridge for the Windows display picker and privacy settings.
- **Interface:** React, TypeScript, Vite, and Lucide icons. The desktop layout adapts to narrower windows and reduced-motion settings.
- **Service:** Express and Socket.IO host authentication, authorization, message history, presence, uploads, server features, and WebRTC signaling. It runs locally inside the desktop app or separately for a shared deployment.
- **Voice/video:** WebRTC media is sent directly between participants; Socket.IO carries signaling. Voice direct messages are limited to two participants, group DM calls to ten. A TURN relay improves reachability. Large calls need an SFU such as LiveKit, which is not bundled or configured here.
- **Storage:** A single-process JSON store is atomically replaced on writes. It is suitable for local use and small private communities, not high-traffic deployments or multiple service replicas. Move to a transactional database and managed object storage before operating at scale.

## Feature limits

This is a working early build, not a feature-for-feature Discord replacement. Email/phone verification, password recovery, passkeys, two-factor authentication, device/session management, end-to-end encryption, account data export/deletion, custom permission roles, bans/timeouts, automated moderation, read receipts/unread markers, per-conversation notification rules, message forwarding, GIF search, external account connections, bots/apps, discovery/community onboarding, mobile clients, and a high-scale SFU are not implemented. Space roles are currently owner, admin, and member; private channels are assigned to individual members. Soundboard playback is local to the person who presses play and is not injected into voice audio. WebRTC camera/screenshare quality and reachability depend on devices, Windows privacy settings, and network/TURN configuration. No feature in CORE is paid.

## GitHub Actions and Windows releases

`.github/workflows/build-windows.yml` builds an installer on pushes to `main` and manual runs. The installer is attached to the workflow run as a downloadable Actions artifact.

`.github/workflows/release-windows.yml` builds the Windows installer when a version tag such as `v1.2.1` is pushed, attaches it to the GitHub Release, and also stores it as an Actions artifact.

To publish a release from a checkout:

```powershell
git tag v1.2.1
git push origin v1.2.1
```

The release workflow declares `contents: write` and uses GitHub's automatic `GITHUB_TOKEN`; it needs no personal access token or workflow secret. In **Settings → Actions → General → Workflow permissions**, allow GitHub Actions to create releases/write repository contents. Increase the version in both `package.json` and `package-lock.json` and use a new tag for every release.

The current public repository is [APGSwizzVR/CORE](https://github.com/APGSwizzVR/CORE). After the tagged Actions run finishes, download the unsigned x64 installer from its [Releases page](https://github.com/APGSwizzVR/CORE/releases).

