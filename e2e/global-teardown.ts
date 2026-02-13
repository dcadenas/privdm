import { execSync } from 'node:child_process';

const CONTAINER_NAME = 'privdm-e2e-relay';

export default async function globalTeardown() {
  try {
    execSync(`docker stop ${CONTAINER_NAME}`, { stdio: 'inherit' });
  } catch {
    // Container already stopped or removed — fine
  }
}
