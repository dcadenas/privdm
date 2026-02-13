import { nowSeconds, randomPastTimestamp } from '../timestamp';

describe('nowSeconds', () => {
  it('returns current time in seconds', () => {
    const before = Math.floor(Date.now() / 1000);
    const result = nowSeconds();
    const after = Math.floor(Date.now() / 1000);
    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after);
  });
});

describe('randomPastTimestamp', () => {
  it('returns a timestamp in the past', () => {
    const now = nowSeconds();
    const ts = randomPastTimestamp();
    expect(ts).toBeLessThanOrEqual(now);
  });

  it('returns a timestamp within 2 days of now', () => {
    const now = nowSeconds();
    const twoDays = 2 * 24 * 60 * 60;
    const ts = randomPastTimestamp();
    expect(now - ts).toBeLessThanOrEqual(twoDays);
    expect(now - ts).toBeGreaterThanOrEqual(0);
  });
});
