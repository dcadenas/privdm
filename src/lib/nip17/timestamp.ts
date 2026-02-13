const TWO_DAYS_IN_SECONDS = 2 * 24 * 60 * 60;

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Returns a random timestamp within the past 2 days (per NIP-17 spec). */
export function randomPastTimestamp(): number {
  const offset = Math.floor(Math.random() * TWO_DAYS_IN_SECONDS);
  return nowSeconds() - offset;
}
