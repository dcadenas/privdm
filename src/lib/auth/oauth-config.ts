import type { OAuthConfig } from 'divine-signer';
import { oauthStorage } from './oauth-storage';

export function getOAuthConfig(): OAuthConfig {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
  return {
    clientId: 'privdm',
    redirectUri: `${origin}/auth/callback`,
    storage: oauthStorage,
  };
}
