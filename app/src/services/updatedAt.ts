// A crowd reading's time, worded for how old it is. Mall readings can be a
// weeks-old Popular Times pattern (used whenever a fresh scrape isn't
// possible), so a bare time of day would pass an old pattern off as today's.
export function formatUpdatedAt(iso: string): string {
  const updated = new Date(iso);
  const now = new Date();
  const sameDay = updated.toDateString() === now.toDateString();
  if (sameDay) {
    return updated.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  const sameYear = updated.getFullYear() === now.getFullYear();
  return updated.toLocaleDateString([], { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}
