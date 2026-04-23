"use client";

import { useState } from "react";
import { formatSchedule } from "@/lib/formatter";

const SAMPLE = `(five)月 企画スケジュール
(music note)楽しい企画
06 20:00 ワイン会🍷
12  20:00 ワイン会🍷
13 19:30 JamBorees🏀
14 20 :00 ワイン会
19  20:00 ワイン会🍷
23 20:00 ワイン会🍷
6/1 20:00ワイン会🍷

(5)月イベント、講演会スケジュール
📖講演会
🆕05  19:30 サリさん
🆕09 10:00 こうじろうさん
🆕11 20:00 店長さん(zoom
16  10:00 アキラさん
20  19:30 しのさん
23  13:00 しげおさん
🆕25 19:30 野秋さん(zoom
🆕30  10:00 沙織さん(zoom
🍸WEMOVEカフェバー
(a)
01 19:00-
09 18:00-⚠️
17 18:30-
24 18:30-
28 19:00-
(b)
03 18:30-
08 19:00-
16 18:30-
22 19:00-
🎊WEMOVE大型企画
23 18:00 Aスキプレ💘
30 18:00 Bスキプレ💘`;

export default function ScheduleFormatter() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [copied, setCopied] = useState(false);

  function handleFormat() {
    setOutput(formatSchedule(input));
    setCopied(false);
  }

  function handleCopy() {
    navigator.clipboard.writeText(output).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  function loadSample() {
    setInput(SAMPLE);
    setOutput("");
    setCopied(false);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        予定テキストを貼り付けると、曜日を自動追加して整形します。
        LINEやメッセージにそのままコピペして共有できます。
      </p>

      <div className="relative">
        <textarea
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setOutput("");
          }}
          placeholder="ここに予定テキストを貼り付け..."
          rows={9}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent resize-y font-mono"
        />
        <button
          onClick={loadSample}
          className="absolute top-2 right-2 text-xs text-slate-400 hover:text-indigo-500 bg-white border border-slate-200 rounded px-2 py-0.5 transition-colors"
        >
          サンプル
        </button>
      </div>

      <button
        onClick={handleFormat}
        disabled={!input.trim()}
        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold rounded-lg py-2.5 text-sm transition-colors"
      >
        ✨ 整形する
      </button>

      {output && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              整形結果
            </p>
            <button
              onClick={handleCopy}
              className={`flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                copied
                  ? "bg-green-100 text-green-700"
                  : "bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
              }`}
            >
              {copied ? (
                <>✓ コピーしました</>
              ) : (
                <>
                  <CopyIcon />
                  コピー
                </>
              )}
            </button>
          </div>

          <pre className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm whitespace-pre-wrap font-mono text-slate-700 leading-relaxed overflow-x-auto max-h-[32rem] overflow-y-auto">
            {output}
          </pre>

          <p className="text-xs text-slate-400 text-right">
            LINEやメッセージにそのまま貼り付けて使えます
          </p>
        </div>
      )}
    </div>
  );
}

function CopyIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="8" y="8" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}
