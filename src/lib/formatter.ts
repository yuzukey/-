const DOW = ["日", "月", "火", "水", "木", "金", "土"];

// Text-encoded emoji and number codes → actual values
const NORM_MAP: [RegExp, string][] = [
  [/\(music\s*note\)/gi, "🎵"],
  [/\(five\)/gi, "5"],
  [/\(four\)/gi, "4"],
  [/\(six\)/gi, "6"],
  [/\(seven\)/gi, "7"],
  [/\(eight\)/gi, "8"],
  [/\(nine\)/gi, "9"],
  [/\(ten\)/gi, "10"],
  [/\(one\)/gi, "1"],
  [/\(two\)/gi, "2"],
  [/\(three\)/gi, "3"],
  [/\((\d+)\)/g, "$1"],                          // "(5)" → "5"
  [/(\d+)\s*:\s*(\d{2})/g, "$1:$2"],             // "20 :00" → "20:00"
  [/\(zoom[^)]*\)?\s*$/gim, "(Zoom)"],           // normalize "(zoom" → "(Zoom)"
];

function normalize(text: string): string {
  for (const [p, r] of NORM_MAP) text = text.replace(p, r);
  return text;
}

function getDow(year: number, month: number, day: number): string {
  const d = new Date(year, month - 1, day);
  return isNaN(d.getTime()) ? "?" : DOW[d.getDay()];
}

interface EventItem {
  isNew: boolean;
  text: string; // formatted "DD日(E) HH:MM  title" part
}

interface Block {
  heading: string;
  baseHeading: string;
  isMainHeader: boolean;
  events: EventItem[];
}

function parseEventLine(
  line: string,
  year: number,
  month: number
): EventItem | null {
  // Cross-month: "6/1 20:00ワイン会" or "6/1 20:00 ワイン会"
  let m = line.match(/^(\d+)\/(\d+)\s*(\d{1,2}:\d{2})([-]?)\s*(.*)/);
  if (m) {
    const mo = parseInt(m[1]);
    const d = parseInt(m[2]);
    const time = m[3] + m[4];
    const title = m[5].trim();
    const dw = getDow(year, mo, d);
    return {
      isNew: false,
      text: `${mo}/${d}(${dw}) ${time}${title ? "  " + title : ""}`,
    };
  }

  // Optional 🆕, then DD HH:MM(-) title
  m = line.match(/^(🆕\s*)?(\d{1,2})\s+(\d{1,2}:\d{2})([-]?)\s*(.*)/);
  if (m) {
    const isNew = !!m[1];
    const day = parseInt(m[2]);
    const time = m[3] + m[4];
    const title = m[5].trim();
    const dw = getDow(year, month, day);
    const dayStr = day.toString().padStart(2, " ");
    return {
      isNew,
      text: `${dayStr}日(${dw}) ${time}${title ? "  " + title : ""}`,
    };
  }

  return null;
}

export function formatSchedule(raw: string): string {
  const text = normalize(raw);
  const lines = text.split("\n");

  const year = new Date().getFullYear();
  let month = new Date().getMonth() + 1;

  const blocks: Block[] = [];
  let current: Block | null = null;

  const flush = () => {
    if (current) {
      blocks.push(current);
      current = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Track current month from any line starting with "N月"
    const mm = line.match(/^(\d+)月/);
    if (mm) month = parseInt(mm[1]);

    // Event line?
    const ev = parseEventLine(line, year, month);
    if (ev) {
      if (!current) {
        current = {
          heading: "📅 イベント",
          baseHeading: "📅 イベント",
          isMainHeader: false,
          events: [],
        };
      }
      current.events.push(ev);
      continue;
    }

    // Sub-label like "(a)" or "(b)"
    if (/^\([a-zA-Z]\)$/.test(line)) {
      if (current && current.events.length > 0) {
        // Flush current section, start a new one with same base + new label
        blocks.push({ ...current, events: [...current.events] });
        current = {
          heading: `${current.baseHeading} ${line}`,
          baseHeading: current.baseHeading,
          isMainHeader: false,
          events: [],
        };
      } else if (current) {
        current.heading = `${current.baseHeading} ${line}`;
      }
      continue;
    }

    // Main section header: "5月 XXXスケジュール" etc. — just a divider
    const isMainHeader = !!mm && /スケジュール|イベント/.test(line);
    if (isMainHeader) {
      flush();
      blocks.push({
        heading: line,
        baseHeading: line,
        isMainHeader: true,
        events: [],
      });
      continue;
    }

    // Regular section heading
    flush();
    current = { heading: line, baseHeading: line, isMainHeader: false, events: [] };
  }

  flush();

  // Render
  const MAIN_SEP = "━".repeat(24);
  const SUB_SEP = "─".repeat(20);

  const parts: string[] = [];

  for (const b of blocks) {
    // Skip empty non-header blocks
    if (!b.isMainHeader && b.events.length === 0) continue;

    if (parts.length > 0) parts.push("");

    if (b.isMainHeader) {
      parts.push(MAIN_SEP);
      parts.push(b.heading);
      parts.push(MAIN_SEP);
    } else {
      parts.push(b.heading);
      parts.push(SUB_SEP);

      const hasSomeNew = b.events.some((e) => e.isNew);
      for (const ev of b.events) {
        // When section has 🆕 events, indent non-new ones so they visually align
        const prefix = hasSomeNew ? (ev.isNew ? "🆕 " : "　 ") : "";
        parts.push(prefix + ev.text);
      }
    }
  }

  return parts.join("\n").trim();
}
