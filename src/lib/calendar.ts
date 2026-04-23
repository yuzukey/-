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
