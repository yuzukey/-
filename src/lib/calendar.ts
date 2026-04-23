export interface CalendarEvent {
  title: string;
  startDate: string;   // YYYY-MM-DD
  startTime: string;   // HH:MM
  endDate: string;     // YYYY-MM-DD
  endTime: string;     // HH:MM
  location: string;
  description: string;
}

function toGCalDateTime(date: string, time: string): string {
  const d = date.replace(/-/g, "");
  const t = (time || "000000").replace(/:/g, "").padEnd(6, "0");
  return `${d}T${t}`;
}

export function generateGoogleCalendarUrl(event: CalendarEvent): string {
  const start = toGCalDateTime(event.startDate, event.startTime);
  const endDate = event.endDate || event.startDate;
  const end = toGCalDateTime(endDate, event.endTime || event.startTime);

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${start}/${end}`,
    details: event.description,
    location: event.location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function encodeEvent(event: CalendarEvent): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(event))));
}

export function decodeEvent(hash: string): CalendarEvent | null {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(hash))));
  } catch {
    return null;
  }
}

export function formatDateJa(date: string): string {
  if (!date) return "";
  const [y, m, d] = date.split("-");
  return `${y}年${parseInt(m)}月${parseInt(d)}日`;
}

export function formatTimeRange(start: string, end: string): string {
  if (!start) return "";
  return end ? `${start} 〜 ${end}` : start;
}

// ---- ICS (iCalendar) export for bulk import ----

function escapeICS(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/[,;]/g, "\\$&")
    .replace(/\n/g, "\\n");
}

function addOneHour(date: string, time: string): string {
  const [h, m] = (time || "00:00").split(":").map(Number);
  const newH = (h + 1) % 24;
  return toGCalDateTime(date, `${String(newH).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
}

export function generateICS(events: CalendarEvent[]): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Event Calendar Sharing//JA",
    "CALSCALE:GREGORIAN",
  ];

  for (const ev of events) {
    const start = toGCalDateTime(ev.startDate, ev.startTime);
    const end = ev.endTime
      ? toGCalDateTime(ev.endDate || ev.startDate, ev.endTime)
      : addOneHour(ev.endDate || ev.startDate, ev.startTime);

    lines.push(
      "BEGIN:VEVENT",
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${escapeICS(ev.title)}`,
    );
    if (ev.location) lines.push(`LOCATION:${escapeICS(ev.location)}`);
    if (ev.description) lines.push(`DESCRIPTION:${escapeICS(ev.description)}`);
    lines.push(
      `UID:${start}-${Math.random().toString(36).slice(2)}@event-cal`,
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
