# CORE

CORE is a Windows-first desktop chat app with a quieter, more considered take on the familiar server, channel, and conversation layout. Its desktop shell is Electron; the interface is React, TypeScript, and Vite; and the included Node service handles accounts, stored messages, uploads, presence, and WebRTC signaling.

## What works

- Create an account, sign in, edit a profile, set presence, and choose an accent theme.
- Create spaces and text or voice channels. Invite links can be copied, accepted, revoked by a space owner or admin, and configured to expire in one hour to 30 days.
- Send live channel and one-to-one messages, edit or remove your own messages, add shared reactions, see typing and presence, browse recent history, and start one-to-one calls.
- Share up to five validated image, video, audio, PDF, or text attachments per message (10 MB each).
- Join voice rooms with microphone mute, deafen, camera, and screen-share controls. CORE shows when a participant has their camera on or is sharing; the Windows desktop app prompts you to choose the screen or app window.
- Crop, zoom, and reposition JPG, PNG, or WebP profile and space artwork. Images are limited to 8 MB.
- Upload and manage space emojis, stickers, and soundboard clips. Images are limited to 8 MB and audio to 10 MB.
- Edit a space name and description, update its icon and banner, and manage members, invites, and shared assets.
- Use the built-in emoji, sticker, and soundboard choices, and switch among four accent themes, light appearance, or system appearance.
- Configure server and member roles. Server and channel endpoints check membership, and space asset and role management is restricted to owners and admins.

## Run the desktop app

Requirements: Node.js 24 and npm.

```powershell
npm install
npm run dev
```

The development command starts the Vite interface and the local CORE service. The desktop app stores its local accounts, chats, and uploads under Electron's per-user application data folder. For a local web preview during development, run `npm run server` in one terminal and `npm run preview` in another.

To package a Windows installer on a Windows machine:

```powershell
npm install
npm run package:win
```

The installer is written to `release/`. It is currently unsigned; Windows SmartScreen may show a publisher warning. A code-signing certificate is needed to sign it.

## Run a shared CORE server

Each desktop install is local by default. For shared accounts and conversations, run one CORE service on a machine reachable by your group and point each app to it from **Server setup** on the sign-in screen. Use HTTPS for a public service. A reverse proxy such as Caddy or nginx can terminate HTTPS and forward requests and WebSocket upgrades to port 4179.

For a Node deployment:

```powershell
Copy-Item .env.example .env
npm install
npm run server
```

Set `CORE_PUBLIC_URL` to the public HTTPS address so generated invite links point to the right place. Set `CORE_DATA_DIR` to persistent storage. `CORE_BIND_ADDRESS` defaults to `0.0.0.0`; set it to `127.0.0.1` when only a reverse proxy on the same machine should reach the service. Never commit `.env` or put `CORE_TURN_SECRET` in a desktop build.

Docker Compose is also available:

```powershell
Copy-Item .env.example .env
docker compose up --build -d
```

The container binds to localhost port 4179 and keeps its database and uploads in a named volume. Configure the reverse proxy and set `CORE_PUBLIC_URL` before sharing it publicly.

### Configuration

| Variable | Purpose |
| --- | --- |
| `VITE_CORE_SERVER_URL` | Optional shared server URL embedded at build time. Normally leave blank and let each desktop user choose in Server setup. |
| `PORT` | Standalone service port, default `4179`. |
| `CORE_BIND_ADDRESS` | Standalone service bind address, default `0.0.0.0`. |
| `CORE_PUBLIC_URL` | Public HTTPS origin used in invite links. |
| `CORE_ALLOWED_ORIGINS` | Allowed Socket.IO browser origins. |
| `CORE_DATA_DIR` | Directory for the JSON data file and uploaded files. |
| `CORE_STUN_URLS` | Comma-separated STUN URLs; defaults to Google's public STUN service. |
| `CORE_TURN_URLS` | Optional comma-separated coturn TURN URLs. |
| `CORE_TURN_SECRET` | Server-only coturn shared secret used to mint short-lived client credentials. |

Calls use peer-to-peer WebRTC. STUN can establish many connections; networks that block direct peer paths need a TURN relay such as coturn. A larger community would need a media SFU, which this prototype does not include. The ICE configuration endpoint creates one-hour coturn REST credentials when both TURN settings are configured.

## Architecture and safety

- **Desktop:** Electron creates a context-isolated, sandboxed window with Node integration disabled. Screen/window capture is presented through an explicit desktop picker.
- **Interface:** React, TypeScript, Vite, and Lucide icons. The responsive layout includes server navigation, channel and DM lists, message history, people panel, profile and space dialogs, and call controls.
- **Service:** Express and Socket.IO run in the desktop app for local use or separately for a shared deployment. Passwords are stored as salted scrypt hashes; session tokens are random and stored as hashes. Sessions use HTTP-only cookies. Login attempts are rate-limited.
- **Storage:** A JSON file is atomically replaced on writes; uploads are stored alongside it. Back up the full `CORE_DATA_DIR` while the service is stopped. This simple single-process storage is suitable for a small group, not a high-traffic service or multiple server replicas.
- **Input:** API payloads are validated, message and image/audio sizes are bounded, and uploaded file signatures are checked. Keep the service behind HTTPS for remote use.

This is an early usable build, not a full implementation of every item in the supplied Discord feature inventory. It does not include email verification, password recovery, end-to-end message encryption, group DMs, threads, message search, polls, scheduled events, moderation audit history, bot/app integrations, or an SFU. There is no paid tier or billing. Media and voice calls require browser/OS microphone and camera access. Screen selection is provided by the Windows desktop picker. Screen and camera video use peer-to-peer WebRTC; larger calls need an SFU. TURN can improve connectivity on restrictive networks. Soundboard audio plays locally for the person who selects a sound; it is not mixed into voice chat. Invitations are web links to the shared CORE service and need that service to be reachable by invitees.

## Windows releases on GitHub

The repository includes two Actions workflows:

- `Build Windows installer` runs on pushes to `main` and can also be started manually. Its installer is available from the workflow run for 30 days.
- `Publish Windows release` runs when a version tag such as `v1.0.0` is pushed. It builds an NSIS installer, saves it as an Actions artifact, and attaches the `.exe` to a GitHub Release.

To publish a release from a checkout:

```powershell
git tag v1.0.0
git push origin v1.0.0
```

In GitHub, ensure **Settings → Actions → General → Workflow permissions** allows the repository `GITHUB_TOKEN` to write contents. The release job declares `contents: write`; it uses GitHub's automatically provided token and needs no personal access token or secret. Wait for the tagged workflow run to finish, then download the installer from the Releases page. Increase the version in `package.json` and use a new tag for each release.

The installer target is NSIS x64. The workflow does not sign the binary; configure a code-signing certificate separately if you need a trusted publisher identity.

