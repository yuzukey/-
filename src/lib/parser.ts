import type { CalendarEvent } from "./calendar";

const THIS_YEAR = new Date().getFullYear();

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

// ---- Date parsing ----

function extractDate(text: string): { date: string; rest: string } | null {
  // YYYY年M月D日 / YYYY/M/D / YYYY-M-D
  let m = text.match(/(\d{4})[年\/\-](\d{1,2})[月\/\-](\d{1,2})日?/);
  if (m) {
    return {
      date: `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`,
      rest: text.replace(m[0], " ").trim(),
    };
  }

  // M月D日 (use current year)
  m = text.match(/(\d{1,2})月(\d{1,2})日?/);
  if (m) {
    return {
      date: `${THIS_YEAR}-${pad(+m[1])}-${pad(+m[2])}`,
      rest: text.replace(m[0], " ").trim(),
    };
  }

  // M/D (use current year; avoid matching HH:MM)
  m = text.match(/(?<!\d)(\d{1,2})\/(\d{1,2})(?!\d)/);
  if (m) {
    return {
      date: `${THIS_YEAR}-${pad(+m[1])}-${pad(+m[2])}`,
      rest: text.replace(m[0], " ").trim(),
    };
  }

  return null;
}

// ---- Time parsing ----

function extractTime(text: string): { time: string; rest: string } | null {
  // 午前/午後H時M分 or H時M分
  let m = text.match(/(午前|午後)?(\d{1,2})時(\d{0,2})分?/);
  if (m) {
    let h = +m[2];
    if (m[1] === "午後" && h < 12) h += 12;
    if (m[1] === "午前" && h === 12) h = 0;
    const min = m[3] ? pad(+m[3]) : "00";
    return { time: `${pad(h)}:${min}`, rest: text.replace(m[0], " ").trim() };
  }

  // HH:MM
  m = text.match(/(\d{1,2}):(\d{2})/);
  if (m) {
    return {
      time: `${pad(+m[1])}:${m[2]}`,
      rest: text.replace(m[0], " ").trim(),
    };
  }

  return null;
}

// ---- Range separator ----

function splitTimeRange(text: string): { before: string; after: string } {
  // 〜 ～ - ～ → から まで
  const m = text.match(/[〜～\-–—]|から|to/);
  if (m && m.index !== undefined) {
    return {
      before: text.slice(0, m.index),
      after: text.slice(m.index + m[0].length),
    };
  }
  return { before: text, after: "" };
}

// ---- Key-value structured block ----

function parseStructured(block: string): Partial<CalendarEvent> | null {
  const lines = block.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const result: Partial<CalendarEvent> = {};
  let foundKV = false;

  for (const line of lines) {
    const kv = line.match(/^(日時|時間|開始|場所|会場|詳細|内容|備考|タイトル|題名|件名)[：:]\s*(.+)/);
    if (!kv) continue;
    foundKV = true;
    const key = kv[1];
    const val = kv[2].trim();

    if (["日時", "時間"].includes(key)) {
      const dateResult = extractDate(val);
      if (dateResult) {
        result.startDate = dateResult.date;
        result.endDate = dateResult.date;
        const { before, after } = splitTimeRange(dateResult.rest);
        const st = extractTime(before);
        if (st) result.startTime = st.time;
        if (after) {
          const et = extractTime(after);
          if (et) result.endTime = et.time;
        }
      }
    } else if (["開始"].includes(key)) {
      const t = extractTime(val);
      if (t) result.startTime = t.time;
    } else if (["場所", "会場"].includes(key)) {
      result.location = val;
    } else if (["詳細", "内容", "備考"].includes(key)) {
      result.description = val;
    } else if (["タイトル", "題名", "件名"].includes(key)) {
      result.title = val;
    }
  }

  if (!foundKV) return null;
  return result;
}

// ---- Clean up day-of-week / parenthetical ----

function cleanTitle(t: string): string {
  return t
    .replace(/[（(][月火水木金土日祝・,\d]+[）)]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ---- Parse a single line or block ----

export function parseEventText(text: string): CalendarEvent | null {
  const block = text.trim();
  if (!block) return null;

  // Try structured KV first
  const structured = parseStructured(block);
  const base: CalendarEvent = {
    title: "",
    startDate: "",
    startTime: "",
    endDate: "",
    endTime: "",
    location: "",
    description: "",
    ...structured,
  };

  // For inline / first line
  const firstLine = block.split(/\n/)[0].trim();
  let working = firstLine;

  if (!base.startDate) {
    const d = extractDate(working);
    if (d) {
      base.startDate = d.date;
      base.endDate = d.date;
      working = d.rest;
    }
  }

  if (!base.startTime) {
    const { before, after } = splitTimeRange(working);
    const st = extractTime(before);
    if (st) {
      base.startTime = st.time;
      working = st.rest;
      if (after) {
        const et = extractTime(after);
        if (et) {
          base.endTime = et.time;
          working = et.rest + " " + working;
        }
      } else {
        working = before.replace(st.time, " ").trim() + " " + after;
      }
    }
  }

  if (!base.title) {
    base.title = cleanTitle(working) || "（タイトルなし）";
  }

  if (!base.startDate) return null;

  return base;
}

// ---- Parse multiple events (blank-line separated) ----

export function parseMultipleEvents(text: string): CalendarEvent[] {
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const results: CalendarEvent[] = [];

  for (const block of blocks) {
    const event = parseEventText(block);
    if (event) results.push(event);
  }

  return results;
}
