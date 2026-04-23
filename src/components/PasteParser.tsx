"use client";

import { useState } from "react";
import { parseMultipleEvents } from "@/lib/parser";
import {
  generateGoogleCalendarUrl,
  encodeEvent,
  formatDateJa,
  formatTimeRange,
  type CalendarEvent,
} from "@/lib/calendar";

const PLACEHOLDER = `例：
チームミーティング
日時：2026年5月10日 14:00〜15:00
場所：会議室A
詳細：月次定例

懇親会
日時：5月15日 18:30〜21:00
場所：渋谷 〇〇レストラン`;

export default function PasteParser() {
  const [text, setText] = useState("");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [parsed, setParsed] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  function handleParse() {
    const result = parseMultipleEvents(text);
    setEvents(result);
    setParsed(true);
  }

  function handleCopyShareLink(event: CalendarEvent, idx: number) {
    const hash = encodeEvent(event);
    const url = `${window.location.origin}${window.location.pathname}#${hash}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    });
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-500">
        メールやチャットからコピーした予定テキストを貼り付けてください。
        複数の予定は空行で区切ると一括で読み込めます。
      </p>

      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setParsed(false);
          setEvents([]);
        }}
        placeholder={PLACEHOLDER}
        rows={8}
        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent resize-y font-mono"
      />

      <button
        onClick={handleParse}
        disabled={!text.trim()}
        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold rounded-lg py-2 text-sm transition-colors"
      >
        予定を読み込む
      </button>

      {parsed && events.length === 0 && (
        <div className="text-center text-sm text-slate-500 py-6">
          予定を認識できませんでした。日時が含まれているか確認してください。
        </div>
      )}

      {events.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-slate-600">
            {events.length}件の予定を読み込みました
          </p>
          {events.map((ev, i) => (
            <EventCard
              key={i}
              event={ev}
              onAddToCalendar={() =>
                window.open(generateGoogleCalendarUrl(ev), "_blank", "noopener")
              }
              onCopyLink={() => handleCopyShareLink(ev, i)}
              linkCopied={copiedIdx === i}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EventCard({
  event,
  onAddToCalendar,
  onCopyLink,
  linkCopied,
}: {
  event: CalendarEvent;
  onAddToCalendar: () => void;
  onCopyLink: () => void;
  linkCopied: boolean;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-slate-800 text-sm">{event.title}</h3>
      </div>

      <div className="grid grid-cols-1 gap-1 text-sm text-slate-600">
        <Row icon="📅">
          {formatDateJa(event.startDate)}
          {event.endDate && event.endDate !== event.startDate &&
            ` 〜 ${formatDateJa(event.endDate)}`}
          {(event.startTime || event.endTime) && (
            <span className="ml-2 text-indigo-600 font-medium">
              {formatTimeRange(event.startTime, event.endTime)}
            </span>
          )}
        </Row>
        {event.location && <Row icon="📍">{event.location}</Row>}
        {event.description && (
          <Row icon="📝">
            <span className="text-slate-500">{event.description}</span>
          </Row>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={onAddToCalendar}
          className="flex-1 flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg py-2 text-xs transition-colors"
        >
          <GoogleCalIcon />
          Googleカレンダーに追加
        </button>
        <button
          onClick={onCopyLink}
          className="shrink-0 border border-slate-300 hover:bg-slate-50 text-slate-600 font-semibold rounded-lg py-2 px-3 text-xs transition-colors"
        >
          {linkCopied ? "コピー済 ✓" : "共有リンク"}
        </button>
      </div>
    </div>
  );
}

function Row({
  icon,
  children,
}: {
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="shrink-0 text-base leading-none">{icon}</span>
      <span className="text-sm leading-snug">{children}</span>
    </div>
  );
}

function GoogleCalIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="4" width="18" height="17" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
