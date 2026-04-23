"use client";

import { useState } from "react";
import type { CalendarEvent } from "@/lib/calendar";
import {
  generateGoogleCalendarUrl,
  encodeEvent,
  formatDateJa,
  formatTimeRange,
} from "@/lib/calendar";

const EMPTY: CalendarEvent = {
  title: "",
  startDate: "",
  startTime: "",
  endDate: "",
  endTime: "",
  location: "",
  description: "",
};

export default function EventForm() {
  const [event, setEvent] = useState<CalendarEvent>(EMPTY);
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);

  function set(key: keyof CalendarEvent, value: string) {
    setEvent((prev) => ({ ...prev, [key]: value }));
    setShareUrl("");
  }

  function handleGenerate() {
    if (!event.title || !event.startDate) return;
    const hash = encodeEvent(event);
    const url = `${window.location.origin}${window.location.pathname}#${hash}`;
    setShareUrl(url);
    setCopied(false);
  }

  function handleCopy() {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const gcalUrl = event.title && event.startDate
    ? generateGoogleCalendarUrl(event)
    : null;

  const isValid = !!event.title && !!event.startDate;

  return (
    <div className="space-y-5">
      {/* Title */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          タイトル <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={event.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="チームミーティング"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
        />
      </div>

      {/* Date row */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            開始日 <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={event.startDate}
            onChange={(e) => {
              set("startDate", e.target.value);
              if (!event.endDate) set("endDate", e.target.value);
            }}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            終了日
          </label>
          <input
            type="date"
            value={event.endDate}
            onChange={(e) => set("endDate", e.target.value)}
            min={event.startDate}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
          />
        </div>
      </div>

      {/* Time row */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            開始時刻
          </label>
          <input
            type="time"
            value={event.startTime}
            onChange={(e) => set("startTime", e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            終了時刻
          </label>
          <input
            type="time"
            value={event.endTime}
            onChange={(e) => set("endTime", e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
          />
        </div>
      </div>

      {/* Location */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          場所
        </label>
        <input
          type="text"
          value={event.location}
          onChange={(e) => set("location", e.target.value)}
          placeholder="会議室A / Zoom"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          詳細・メモ
        </label>
        <textarea
          value={event.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="アジェンダや参加方法など"
          rows={3}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent resize-none"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <button
          onClick={handleGenerate}
          disabled={!isValid}
          className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold rounded-lg py-2 text-sm transition-colors"
        >
          共有リンクを生成
        </button>
        {gcalUrl && (
          <a
            href={gcalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold rounded-lg py-2 text-sm transition-colors"
          >
            <GoogleCalIcon />
            自分のカレンダーに追加
          </a>
        )}
      </div>

      {/* Share URL */}
      {shareUrl && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">
            共有リンク
          </p>
          <div className="flex gap-2">
            <input
              readOnly
              value={shareUrl}
              className="flex-1 bg-white border border-indigo-200 rounded-lg px-3 py-2 text-xs text-slate-600 focus:outline-none"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              onClick={handleCopy}
              className="shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white px-4 rounded-lg text-sm font-semibold transition-colors"
            >
              {copied ? "コピー済" : "コピー"}
            </button>
          </div>
          <div className="text-xs text-slate-500">
            <span className="font-medium">プレビュー：</span>
            {formatDateJa(event.startDate)}{" "}
            {formatTimeRange(event.startTime, event.endTime)}{" "}
            {event.title}
          </div>
        </div>
      )}
    </div>
  );
}

function GoogleCalIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="4" width="18" height="17" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
