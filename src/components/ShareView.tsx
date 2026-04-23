"use client";

import {
  generateGoogleCalendarUrl,
  formatDateJa,
  formatTimeRange,
  type CalendarEvent,
} from "@/lib/calendar";

export default function ShareView({ event }: { event: CalendarEvent }) {
  const gcalUrl = generateGoogleCalendarUrl(event);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          {/* Header band */}
          <div className="bg-indigo-600 px-6 py-5">
            <p className="text-indigo-200 text-xs font-medium uppercase tracking-widest mb-1">
              イベント
            </p>
            <h1 className="text-white text-2xl font-bold leading-tight">
              {event.title}
            </h1>
          </div>

          {/* Details */}
          <div className="px-6 py-5 space-y-4">
            <Detail icon="📅" label="日時">
              <span className="font-medium">
                {formatDateJa(event.startDate)}
              </span>
              {event.endDate && event.endDate !== event.startDate && (
                <span className="text-slate-500">
                  {" "}〜 {formatDateJa(event.endDate)}
                </span>
              )}
              {(event.startTime || event.endTime) && (
                <span className="block text-indigo-600 font-medium">
                  {formatTimeRange(event.startTime, event.endTime)}
                </span>
              )}
            </Detail>

            {event.location && (
              <Detail icon="📍" label="場所">
                {event.location}
              </Detail>
            )}

            {event.description && (
              <Detail icon="📝" label="詳細">
                <span className="whitespace-pre-wrap text-slate-600">
                  {event.description}
                </span>
              </Detail>
            )}
          </div>

          {/* CTA */}
          <div className="px-6 pb-6">
            <a
              href={gcalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl py-3 text-base transition-colors shadow"
            >
              <GoogleCalIcon />
              Googleカレンダーに追加
            </a>
          </div>
        </div>

        {/* Back link */}
        <p className="text-center mt-4">
          <a
            href={typeof window !== "undefined" ? window.location.pathname : "/"}
            className="text-sm text-slate-400 hover:text-slate-600 underline"
          >
            新しいイベントを作成する
          </a>
        </p>
      </div>
    </div>
  );
}

function Detail({
  icon,
  label,
  children,
}: {
  icon: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-xl leading-none mt-0.5">{icon}</span>
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">
          {label}
        </p>
        <div className="text-slate-800 text-sm leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

function GoogleCalIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="4" width="18" height="17" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
