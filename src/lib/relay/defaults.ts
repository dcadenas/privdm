const OVERRIDE_URL = import.meta.env.VITE_RELAY_URL;

export const DEFAULT_DM_RELAYS = OVERRIDE_URL
  ? [OVERRIDE_URL]
  : [
      'wss://relay.damus.io',
      'wss://nos.lol',
      'wss://inbox.nostr.wine',
      'wss://auth.nostr1.com',
      'wss://relay.primal.net',
    ];

export const DEFAULT_METADATA_RELAYS = OVERRIDE_URL
  ? [OVERRIDE_URL]
  : [
      'wss://purplepag.es',
      'wss://user.kindpag.es',
      'wss://relay.nos.social',
      'wss://relay.damus.io',
      'wss://relay.primal.net',
    ];
