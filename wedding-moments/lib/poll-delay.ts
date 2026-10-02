// Guests poll quickly while photos are arriving and back off when the library
// is quiet. Focus, visibility and reconnect still trigger an immediate check.
export function guestPollDelay(idleMs: number) {
  if (idleMs < 2 * 60_000) return 3000;
  if (idleMs < 10 * 60_000) return 10_000;
  return 20_000;
}
