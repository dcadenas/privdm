# PrivDM

Private encrypted messaging on Nostr. End-to-end encrypted DMs using NIP-17 gift-wrapped messages with NIP-44 encryption.

**https://privdm.com**

## Features

- End-to-end encrypted direct messages (NIP-17 / NIP-44)
- Multiple sign-in methods: diVine OAuth, browser extension (NIP-07), remote signer (NIP-46), nostrconnect QR, or nsec
- Offline message persistence (IndexedDB)
- Historical message backfill with pagination
- Unread indicators with cross-device sync (NIP-78)
- Rich content: inline images/video, YouTube embeds, nostr entity references
- NIP-89 app handler discovery for referenced events
- DM relay list publishing (kind 10050)

## Setup

```bash
npm install
npm run dev
```

## Environment Variables

Copy `.env.example` to `.env` to customize:

- `VITE_RELAY_URL` — override all relay connections to a single relay (useful for local development)
- `VITE_DIVINE_API` — override the diVine/Keycast OAuth API URL

Both are optional. The app works with defaults out of the box.

## Scripts

```bash
npm run dev          # Vite dev server
npm run build        # TypeScript check + Vite build
npm test             # Run tests (single pass)
npm run test:watch   # Run tests (watch mode)
npm run typecheck    # TypeScript type check
npm run lint         # ESLint
```

## Tech Stack

- React 18 + TypeScript + Vite
- TailwindCSS
- TanStack Query
- nostr-tools
- Dexie (IndexedDB)
- Vitest

## Nostr NIPs

- [NIP-17](https://github.com/nostr-protocol/nips/blob/master/17.md) — Private Direct Messages (gift wrap)
- [NIP-44](https://github.com/nostr-protocol/nips/blob/master/44.md) — Versioned Encryption
- [NIP-46](https://github.com/nostr-protocol/nips/blob/master/46.md) — Nostr Connect (remote signing)
- [NIP-07](https://github.com/nostr-protocol/nips/blob/master/07.md) — Browser Extension Signing
- [NIP-42](https://github.com/nostr-protocol/nips/blob/master/42.md) — Relay Authentication
- [NIP-78](https://github.com/nostr-protocol/nips/blob/master/78.md) — Application-specific Data (read state sync)
- [NIP-89](https://github.com/nostr-protocol/nips/blob/master/89.md) — Recommended Application Handlers
- [NIP-05](https://github.com/nostr-protocol/nips/blob/master/05.md) — Nostr Address (user@domain.com lookup)

## License

MIT
