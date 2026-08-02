import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { execSync } from 'child_process';

const commitHash = execSync('git rev-parse --short HEAD').toString().trim();

export default defineConfig({
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash),
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          framework: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'],
          storage: ['dexie'],
          nostr: ['nostr-tools', '@noble/hashes', 'divine-signer'],
          content: ['micromark', 'micromark-extension-gfm-strikethrough', 'qrcode'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Globs, not bare names: nested checkouts (git worktrees under .worktrees/)
    // otherwise drag their own node_modules and e2e specs into the run.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.worktrees/**', 'e2e/**'],
  },
});
