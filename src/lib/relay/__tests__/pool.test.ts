import { afterEach, describe, expect, it } from 'vitest';
import { destroyPool, getPool } from '../pool';

describe('relay pool', () => {
  afterEach(() => {
    destroyPool();
  });

  it('keeps relay connections open for live subscriptions', () => {
    expect(getPool().idleTimeout).toBe(0);
  });
});
