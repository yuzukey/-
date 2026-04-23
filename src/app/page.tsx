"use client";

import { useEffect, useState } from "react";
import EventForm from "@/components/EventForm";
import PasteParser from "@/components/PasteParser";
import ShareView from "@/components/ShareView";
import { decodeEvent, type CalendarEvent } from "@/lib/calendar";

type Tab = "create" | "paste";

export default function Page() {
  const [sharedEvent, setSharedEvent] = useState<CalendarEvent | null>(null);
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<Tab>("create");

  useEffect(() => {
    setMounted(true);
    const hash = window.location.hash.slice(1);
    if (hash) {
      const ev = decodeEvent(hash);
      if (ev) setSharedEvent(ev);
    }
  }, []);

  // Avoid hydration mismatch — render nothing until client-side hash is checked
  if (!mounted) return null;

  if (sharedEvent) {
    return <ShareView event={sharedEvent} />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-3">
        <div className="bg-indigo-600 text-white rounded-lg w-8 h-8 flex items-center justify-center font-bold text-sm shrink-0">
          📅
        </div>
        <div>
          <h1 className="font-bold text-slate-800 leading-none">イベント日程共有</h1>
          <p className="text-xs text-slate-400 mt-0.5">作成・共有・Googleカレンダー連携</p>
        </div>
      </header>

      <main className="flex-1 flex justify-center px-4 py-8">
        <div className="w-full max-w-lg">
          {/* Tabs */}
          <div className="flex bg-slate-100 rounded-xl p-1 mb-6">
            <TabButton active={tab === "create"} onClick={() => setTab("create")}>
              ✏️ イベント作成
            </TabButton>
            <TabButton active={tab === "paste"} onClick={() => setTab("paste")}>
              📋 予定を貼り付け
            </TabButton>
          </div>

          {/* Panel */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            {tab === "create" ? <EventForm /> : <PasteParser />}
          </div>

          {/* How-to footer */}
          <div className="mt-6 bg-indigo-50 rounded-xl p-4 text-xs text-slate-500 space-y-1.5">
            <p className="font-semibold text-slate-600">使い方</p>
            <p>
              <span className="font-medium text-slate-700">イベント作成：</span>
              フォームに入力 → 「共有リンクを生成」でURLをコピーして送る
            </p>
            <p>
              <span className="font-medium text-slate-700">予定を貼り付け：</span>
              メールやチャットの文章をそのまま貼り付け → 自動でGoogleカレンダー登録リンクを生成
            </p>
            <p>
              <span className="font-medium text-slate-700">受け取った側：</span>
              共有リンクを開いて「Googleカレンダーに追加」ボタンを押すだけ
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
      className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-all ${
        active
          ? "bg-white text-indigo-600 shadow-sm"
          : "text-slate-500 hover:text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}
