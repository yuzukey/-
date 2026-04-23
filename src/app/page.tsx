"use client";

import { useEffect, useState } from "react";
import EventForm from "@/components/EventForm";
import PasteParser from "@/components/PasteParser";
import ScheduleFormatter from "@/components/ScheduleFormatter";
import ShareView from "@/components/ShareView";
import { decodeEvent, type CalendarEvent } from "@/lib/calendar";

type Tab = "create" | "paste" | "format";

export default function Page() {
  const [sharedEvent, setSharedEvent] = useState<CalendarEvent | null>(null);
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<Tab>("format");

  useEffect(() => {
    setMounted(true);
    const hash = window.location.hash.slice(1);
    if (hash) {
      const ev = decodeEvent(hash);
      if (ev) setSharedEvent(ev);
    }
  }, []);

  if (!mounted) return null;

  if (sharedEvent) {
    return <ShareView event={sharedEvent} />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-3">
        <div className="bg-indigo-600 text-white rounded-lg w-8 h-8 flex items-center justify-center shrink-0 text-base">
          📅
        </div>
        <div>
          <h1 className="font-bold text-slate-800 leading-none">イベント日程共有</h1>
          <p className="text-xs text-slate-400 mt-0.5">整形・共有・Googleカレンダー連携</p>
        </div>
      </header>

      <main className="flex-1 flex justify-center px-4 py-8">
        <div className="w-full max-w-lg">
          {/* Tabs */}
          <div className="flex bg-slate-100 rounded-xl p-1 mb-6">
            <TabButton active={tab === "format"} onClick={() => setTab("format")}>
              ✨ 整形して共有
            </TabButton>
            <TabButton active={tab === "create"} onClick={() => setTab("create")}>
              ✏️ イベント作成
            </TabButton>
            <TabButton active={tab === "paste"} onClick={() => setTab("paste")}>
              📋 カレンダー追加
            </TabButton>
          </div>

          {/* Panel */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            {tab === "format" && <ScheduleFormatter />}
            {tab === "create" && <EventForm />}
            {tab === "paste" && <PasteParser />}
          </div>

          {/* How-to */}
          <div className="mt-5 bg-indigo-50 rounded-xl p-4 text-xs text-slate-500 space-y-1.5">
            <p className="font-semibold text-slate-600">使い方</p>
            <p>
              <span className="font-medium text-slate-700">✨ 整形して共有：</span>
              チャットやメモの予定テキストを貼り付け → 曜日付きに整形 → LINEにコピペ
            </p>
            <p>
              <span className="font-medium text-slate-700">✏️ イベント作成：</span>
              フォームで入力 → 共有リンクを生成してURL送付
            </p>
            <p>
              <span className="font-medium text-slate-700">📋 カレンダー追加：</span>
              予定テキストを解析 → Googleカレンダーへ直接追加
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all ${
        active
          ? "bg-white text-indigo-600 shadow-sm"
          : "text-slate-500 hover:text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}
