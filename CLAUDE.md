# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A focused Nostr DM web client for encrypted direct messaging using NIP-17 gift-wrapped DMs with NIP-44 encryption. React 18 + TypeScript + Vite, styled with TailwindCSS + shadcn/ui, async state via TanStack Query, protocol via nostr-tools ^2.23.0.

## Commands

```bash
npm run dev          # Vite dev server
npm run build        # tsc -b && vite build
npm test             # vitest run (single pass)
npm run test:watch   # vitest (watch mode)
npm run typecheck    # tsc --noEmit
npm run lint         # eslint .
npx vitest run src/lib/nip17/giftwrap.test.ts  # Run a single test file
```

## Architecture

### Core Protocol: NIP-17 Gift Wrap DMs

Messages are triple-wrapped for privacy:
1. **Rumor** (kind 14) - unsigned plaintext message (MUST NOT be signed for deniability)
2. **Seal** (kind 13) - rumor encrypted with NIP-44, signed by sender (tags MUST be empty)
3. **Gift Wrap** (kind 1059) - seal encrypted with new ephemeral key per wrap, tags recipient

Critical rules:
- Send a gift wrap to yourself too (to read sent messages)
- Verify `seal.pubkey === rumor.pubkey` (anti-impersonation)
- Randomize seal/wrap timestamps up to 2 days in past
- Discover recipient's DM relays from their kind 10050 event
- Conversation identity = sorted set of `pubkey` + all `p` tags

### Signer Abstraction

All 5 auth methods must work through a unified interface (`NostrDMSigner`):
1. **NIP-07 extension** (`window.nostr`) - browser extensions (Alby, nos2x)
2. **NIP-46 bunker URL** (`bunker://`) - remote signing via WebSocket relay
3. **NIP-46 nostrconnect** (`nostrconnect://`) - QR code for mobile signers (Amber, nsec.app)
4. **Keycast OAuth** (`login.divine.video`) - email/password via diVine, HTTP signing
5. **Plain nsec** - paste secret key directly (warn about security)

Key gotcha: `remote-signer-pubkey` != `user-pubkey` — always call `getPublicKey()` after bunker connect.

### Path Aliases

`@/*` maps to `./src/*` (configured in tsconfig.json and vite.config.ts).

### Testing

Vitest with jsdom environment, globals enabled. Setup file at `src/test/setup.ts`. TDD approach: write failing tests first, then implement.

## Development Approach

- TDD: failing test first, then implement
- Single responsibility, pure functions, <50 line functions
- Structured logging for relay/encryption debugging

## Key References

- [NIP-17](https://github.com/nostr-protocol/nips/blob/master/17.md) - Private DMs (gift wrap)
- [NIP-44](https://github.com/nostr-protocol/nips/blob/master/44.md) - Encryption
- [NIP-46](https://github.com/nostr-protocol/nips/blob/master/46.md) - Remote signing (bunker)
- [NIP-07](https://github.com/nostr-protocol/nips/blob/master/07.md) - Browser extension signing

## Git Conventions

- Commit format: `type: description` (feat, fix, perf, refactor, test)
- Keep diffs minimal
- Don't push without explicit approval
