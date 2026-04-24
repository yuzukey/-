"use client";

import { useState, useCallback, useEffect, useRef } from "react";

const BACKEND = "http://localhost:8000";

type Status = "checking" | "no-backend" | "idle" | "processing" | "done" | "error";

export default function VideoFaceSwap() {
  const [status, setStatus] = useState<Status>("checking");
  const [sourceFiles, setSourceFiles] = useState<File[]>([]);
  const [sourcePreviews, setSourcePreviews] = useState<string[]>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    checkBackend();
  }, []);

  async function checkBackend() {
    try {
      const res = await fetch(`${BACKEND}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      setStatus(res.ok ? "idle" : "no-backend");
    } catch {
      setStatus("no-backend");
    }
  }

  const addSourceImages = useCallback((files: FileList | null) => {
    if (!files) return;
    const added = Array.from(files).slice(0, 5 - sourceFiles.length);
    setSourceFiles(prev => [...prev, ...added].slice(0, 5));
    added.forEach(f => {
      setSourcePreviews(prev => [...prev, URL.createObjectURL(f)].slice(0, 5));
    });
  }, [sourceFiles.length]);

  const removeSource = useCallback((i: number) => {
    setSourceFiles(prev => prev.filter((_, j) => j !== i));
    setSourcePreviews(prev => {
      URL.revokeObjectURL(prev[i]);
      return prev.filter((_, j) => j !== i);
    });
  }, []);

  const handleProcess = useCallback(async () => {
    if (!sourceFiles.length || !videoFile) return;
    setStatus("processing");
    setError(null);
    setResultUrl(null);
    setElapsed(0);

    timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);

    try {
      const fd = new FormData();
      sourceFiles.forEach(f => fd.append("sources", f));
      fd.append("video", videoFile);

      const res = await fetch(`${BACKEND}/swap`, { method: "POST", body: fd });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
        throw new Error(err.detail ?? `HTTP ${res.status}`);
      }

      const blob = await res.blob();
      setResultUrl(URL.createObjectURL(blob));
      setStatus("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "処理中にエラーが発生しました");
      setStatus("idle");
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [sourceFiles, videoFile]);

  const canProcess = sourceFiles.length > 0 && !!videoFile && status === "idle";

  // ── No backend screen ──────────────────────────────────────────────────────
  if (status === "checking") {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-400 animate-pulse">バックエンドに接続中...</p>
      </div>
    );
  }

  if (status === "no-backend") {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col">
        <Header />
        <main className="flex-1 flex justify-center px-4 py-8">
          <div className="w-full max-w-2xl space-y-5">
            <div className="bg-yellow-950 border border-yellow-700 rounded-2xl p-6 space-y-4">
              <h2 className="font-bold text-yellow-300 text-lg">AIバックエンドが起動していません</h2>
              <p className="text-sm text-yellow-200">
                高品質な顔変換にはPythonバックエンドが必要です。
                以下の手順で1回だけセットアップしてください。
              </p>

              <div className="space-y-3">
                <Step n={1} title="Python をインストール（まだの場合）">
                  <p className="text-xs text-gray-300">python.org から Python 3.10 以上をダウンロード＆インストール</p>
                </Step>

                <Step n={2} title="セットアップを実行（初回のみ・数分かかります）">
                  <Code>cd バックエンドフォルダのパス\backend{"\n"}python setup.py</Code>
                </Step>

                <Step n={3} title="バックエンドを起動">
                  <Code>python main.py</Code>
                  <p className="text-xs text-gray-400 mt-1">「Uvicorn running」と表示されたら起動完了</p>
                </Step>

                <Step n={4} title="このページをリロード">
                  <button
                    onClick={checkBackend}
                    className="mt-1 px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-semibold transition-colors"
                  >
                    再接続する
                  </button>
                </Step>
              </div>
            </div>

            <div className="rounded-xl p-4 text-xs text-gray-500 border border-gray-800 space-y-1">
              <p className="font-semibold text-gray-400">なぜバックエンドが必要？</p>
              <p>本物の顔変換AIモデル（InsightFace inswapper）はブラウザでは動作しません。</p>
              <p>ローカルのPythonサーバーで処理するため、動画はインターネットに送信されません。</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ── Main UI ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <Header />

      <main className="flex-1 flex justify-center px-4 py-8">
        <div className="w-full max-w-2xl space-y-5">
          {error && (
            <div className="bg-red-950 border border-red-800 rounded-xl p-4 text-sm text-red-300">
              {error}
            </div>
          )}

          {/* Step 1: Source images */}
          <section className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
            <h2 className="font-semibold text-gray-200 mb-1 flex items-center gap-2">
              <Num>1</Num>差し替え元の顔写真
            </h2>
            <p className="text-xs text-gray-500 mb-4">
              同じ人の写真を複数枚（最大5枚）追加すると精度が上がります
            </p>

            <div className="grid grid-cols-5 gap-2 mb-3">
              {sourcePreviews.map((url, i) => (
                <div key={i} className="relative aspect-square">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="w-full h-full object-cover rounded-lg border border-gray-700" />
                  <button
                    onClick={() => removeSource(i)}
                    className="absolute -top-1.5 -right-1.5 bg-red-600 hover:bg-red-500 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold leading-none"
                  >
                    ×
                  </button>
                </div>
              ))}
              {sourcePreviews.length < 5 && (
                <label className="aspect-square flex flex-col items-center justify-center border-2 border-dashed border-gray-700 rounded-lg cursor-pointer hover:border-violet-500 transition-colors">
                  <span className="text-xl">+</span>
                  <span className="text-[10px] text-gray-500 mt-1">追加</span>
                  <input type="file" accept="image/*" multiple className="hidden"
                    onChange={e => addSourceImages(e.target.files)} />
                </label>
              )}
            </div>

            {sourcePreviews.length === 0 && (
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-700 rounded-xl p-8 cursor-pointer hover:border-violet-500 transition-colors">
                <span className="text-3xl mb-2">📸</span>
                <span className="text-sm text-gray-400">写真をタップして選択</span>
                <span className="text-xs text-gray-600 mt-1">JPG / PNG（複数選択可）</span>
                <input type="file" accept="image/*" multiple className="hidden"
                  onChange={e => addSourceImages(e.target.files)} />
              </label>
            )}
          </section>

          {/* Step 2: Target video */}
          <section className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
            <h2 className="font-semibold text-gray-200 mb-4 flex items-center gap-2">
              <Num>2</Num>差し替え先の動画
            </h2>
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-700 rounded-xl p-6 cursor-pointer hover:border-violet-500 transition-colors min-h-[100px]">
              <span className="text-3xl mb-2">🎬</span>
              {videoFile ? (
                <>
                  <span className="text-sm text-gray-300 truncate max-w-full">{videoFile.name}</span>
                  <span className="text-xs text-gray-500 mt-1">{(videoFile.size / 1024 / 1024).toFixed(1)} MB</span>
                </>
              ) : (
                <>
                  <span className="text-sm text-gray-400">動画をタップして選択</span>
                  <span className="text-xs text-gray-600 mt-1">MP4 / MOV / WebM</span>
                </>
              )}
              <input type="file" accept="video/*" className="hidden"
                onChange={e => e.target.files?.[0] && setVideoFile(e.target.files[0])} />
            </label>
          </section>

          {/* Process button */}
          <button
            onClick={handleProcess}
            disabled={!canProcess}
            className="w-full py-4 rounded-2xl font-bold text-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-violet-600 hover:bg-violet-500 active:scale-[0.99]"
          >
            {status === "processing" ? "AI処理中..." : "フェイススワップ実行"}
          </button>

          {/* Processing indicator */}
          {status === "processing" && (
            <section className="bg-gray-900 rounded-2xl border border-gray-800 p-6 flex items-center gap-4">
              <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin shrink-0" />
              <div>
                <p className="font-semibold text-gray-200">AIが顔変換を処理中...</p>
                <p className="text-sm text-gray-400 mt-0.5">
                  経過: {elapsed}秒　目安: 動画1秒あたり2〜10秒（CPUの場合）
                </p>
              </div>
            </section>
          )}

          {/* Result */}
          {resultUrl && (
            <section className="bg-gray-900 rounded-2xl border border-gray-800 p-6 space-y-4">
              <h2 className="font-semibold text-gray-200">完成！</h2>
              <video src={resultUrl} controls playsInline
                className="w-full rounded-xl border border-gray-700" />
              <a href={resultUrl} download="face-swap-result.mp4"
                className="block w-full py-3 rounded-xl bg-green-600 hover:bg-green-500 text-center font-semibold transition-colors">
                ダウンロード (MP4)
              </a>
            </section>
          )}

          <div className="rounded-xl p-4 text-xs text-gray-500 border border-gray-800 space-y-1">
            <p className="font-semibold text-gray-400">精度を上げるコツ</p>
            <p>• 同じ人の写真を複数枚（3〜5枚）アップロードする</p>
            <p>• 様々な角度・表情の写真を使う</p>
            <p>• 顔がはっきり写っている写真を選ぶ</p>
            <p>• 動画内の顔も明るく鮮明なものが向いています</p>
          </div>
        </div>
      </main>
    </div>
  );
}

// ── Small UI components ────────────────────────────────────────────────────

function Header() {
  return (
    <header className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center gap-3">
      <div className="bg-violet-600 rounded-lg w-8 h-8 flex items-center justify-center font-bold text-sm shrink-0">🎭</div>
      <div>
        <h1 className="font-bold leading-none">動画フェイススワップ</h1>
        <p className="text-xs text-gray-400 mt-0.5">InsightFace AIによる高品質顔変換</p>
      </div>
    </header>
  );
}

function Num({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-violet-600 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">
      {children}
    </span>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="bg-gray-800 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold text-yellow-400 shrink-0 mt-0.5">
        {n}
      </div>
      <div>
        <p className="text-sm font-semibold text-yellow-200 mb-1">{title}</p>
        {children}
      </div>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="bg-gray-900 rounded-lg px-3 py-2 text-xs text-green-400 overflow-x-auto whitespace-pre-wrap">
      {children}
    </pre>
  );
}
