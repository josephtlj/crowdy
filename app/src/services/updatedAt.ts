import { formatTime } from "../i18n/strings";

// A crowd reading's time, worded for how old it is. Mall readings can be a
// weeks-old Popular Times pattern (used whenever a fresh scrape isn't
// possible), so a bare time of day would pass an old pattern off as today's.
export function formatUpdatedAt(iso: string, language: "en" | "zh" = "en"): string {
  const locale = language === "zh" ? "zh-CN" : "en-SG";
  const updated = new Date(iso);
  const now = new Date();
  const sameDay = updated.toDateString() === now.toDateString();
  // formatTime rather than toLocaleTimeString, whose "AM"/"PM" casing
  // varies by phone, so every time in the app reads "12:16 am".
  if (sameDay) return formatTime(updated, language);
  const sameYear = updated.getFullYear() === now.getFullYear();
  return updated.toLocaleDateString(locale, { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}

/**
 * The current hour on the dot, e.g. "11:00 pm" at 11:09 pm. A mall's figure is
 * its usual crowd for the hour, so it is labelled with the hour rather than
 * the time it was fetched.
 * @param language - the app's language
 * @returns the hour text
 */
export function formatCurrentHour(language: "en" | "zh" = "en"): string {
  const hour = new Date();
  hour.setMinutes(0, 0, 0);
  return formatTime(hour, language);
}
