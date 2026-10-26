// "4:30 p.m. CDT", "9:00 AM", "3:00 PM" -> "4:30 PM"
const TIME = /\b(\d{1,2}):(\d{2})\s*([ap])\.?\s*m\.?/i;

export function extractMeetingTime(text) {
  // The time is in the agenda's heading, so only look near the top.
  const match = text.slice(0, 600).match(TIME);
  if (!match) return null;
  const [, hour, minute, amPm] = match;
  return `${Number(hour)}:${minute} ${amPm.toUpperCase()}M`;
}