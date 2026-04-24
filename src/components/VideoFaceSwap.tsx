"use client";

import { useState, useCallback, useEffect } from "react";

const MODEL_URL = "/models";

type Status =
  | "loading-models"
  | "idle"
  | "detecting-source"
  | "processing"
  | "done"
  | "error";

interface FaceTransform {
  center: { x: number; y: number };
  eyeDistance: number;
  angle: number;
}

interface SourceFace {
  img: HTMLImageElement;
  transform: FaceTransform;
  previewUrl: string;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function avgPoint(pts: Array<{ x: number; y: number }>) {
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  };
}

function getFaceTransform(lm: {
  getLeftEye: () => Array<{ x: number; y: number }>;
  getRightEye: () => Array<{ x: number; y: number }>;
}): FaceTransform {
  const le = avgPoint(lm.getLeftEye());
  const re = avgPoint(lm.getRightEye());
  const dx = re.x - le.x;
  const dy = re.y - le.y;
  return {
    center: { x: (le.x + re.x) / 2, y: (le.y + re.y) / 2 },
    eyeDistance: Math.sqrt(dx * dx + dy * dy),
    angle: Math.atan2(dy, dx),
  };
}

function createEllipseMask(
  w: number, h: number,
  cx: number, cy: number,
  rx: number, ry: number
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  grad.addColorStop(0.35, "black");
  grad.addColorStop(1.0, "transparent");
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(rx, ry);
  ctx.fillStyle = grad;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
  return c;
}

function drawSwappedFace(
  ctx: CanvasRenderingContext2D,
  src: SourceFace,
  tgt: FaceTransform,
  box: { x: number; y: number; width: number; height: number }
) {
  const scale = tgt.eyeDistance / src.transform.eyeDistance;
  const rot = tgt.angle - src.transform.angle;
  const W = ctx.canvas.width, H = ctx.canvas.height;

  const tmp = document.createElement("canvas");
  tmp.width = W; tmp.height = H;
  const tmpCtx = tmp.getContext("2d")!;
  tmpCtx.save();
  tmpCtx.translate(tgt.center.x, tgt.center.y);
  tmpCtx.rotate(rot);
  tmpCtx.scale(scale, scale);
  tmpCtx.translate(-src.transform.center.x, -src.transform.center.y);
  tmpCtx.drawImage(src.img, 0, 0);
  tmpCtx.restore();

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height * 0.42;
  const mask = createEllipseMask(W, H, cx, cy, box.width * 0.56, box.height * 0.62);
  tmpCtx.globalCompositeOperation = "destination-in";
  tmpCtx.drawImage(mask, 0, 0);
  ctx.drawImage(tmp, 0, 0);
}

async function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  if (Math.abs(video.currentTime - time) < 0.001) return;
  return new Promise((resolve) => {
    const tid = setTimeout(resolve, 800);
    const h = () => { clearTimeout(tid); video.removeEventListener("seeked", h); resolve(); };
    video.addEventListener("seeked", h);
    video.currentTime = time;
  });
}

// ── processing: MediaRecorder (PC / Android) ──────────────────────────────

async function processMediaRecorder(
  videoFile: File,
  src: SourceFace,
  onProgress: (p: number) => void
): Promise<{ url: string; ext: string }> {
  const faceapi = (await import("face-api.js")).default;
  const videoUrl = URL.createObjectURL(videoFile);
  const video = document.createElement("video");
  video.src = videoUrl; video.muted = true; video.playsInline = true;
  await new Promise<void>((res, rej) => {
    video.onloadedmetadata = () => res();
    video.onerror = () => rej(new Error("動画の読み込みに失敗しました"));
    video.load();
  });

  const W = video.videoWidth, H = video.videoHeight;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
    ? "video/webm;codecs=vp9" : "video/webm";
  const recorder = new MediaRecorder(canvas.captureStream(30), { mimeType });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  const done = new Promise<string>((res) => {
    recorder.onstop = () => {
      URL.revokeObjectURL(videoUrl);
      res(URL.createObjectURL(new Blob(chunks, { type: "video/webm" })));
    };
  });

  recorder.start(100);
  const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 320 });
  const total = Math.ceil(video.duration * 30);

  for (let f = 0; f < total; f++) {
    await seekTo(video, f / 30);
    ctx.drawImage(video, 0, 0, W, H);
    const det = await faceapi.detectSingleFace(canvas, opts).withFaceLandmarks();
    if (det) {
      const b = det.detection.box;
      drawSwappedFace(ctx, src, getFaceTransform(det.landmarks),
        { x: b.x, y: b.y, width: b.width, height: b.height });
    }
    onProgress((f + 1) / total);
    await new Promise<void>((r) => setTimeout(r, 0));
  }

  recorder.stop();
  return { url: await done, ext: "webm" };
}

// ── processing: WebCodecs + mp4-muxer (iOS 16.4+) ────────────────────────

async function processWebCodecs(
  videoFile: File,
  src: SourceFace,
  onProgress: (p: number) => void
): Promise<{ url: string; ext: string }> {
  const faceapi = (await import("face-api.js")).default;
  const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");

  const videoUrl = URL.createObjectURL(videoFile);
  const video = document.createElement("video");
  video.src = videoUrl; video.muted = true; video.playsInline = true;
  await new Promise<void>((res, rej) => {
    video.onloadedmetadata = () => res();
    video.onerror = () => rej(new Error("動画の読み込みに失敗しました"));
    video.load();
  });

  const W = video.videoWidth, H = video.videoHeight;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width: W, height: H },
    fastStart: "in-memory",
  });

  const chunks: { chunk: EncodedVideoChunk; meta?: EncodedVideoChunkMetadata }[] = [];
  const encoder = new VideoEncoder({
    output: (chunk, meta) => chunks.push({ chunk, meta: meta ?? undefined }),
    error: (e) => { throw e; },
  });
  encoder.configure({
    codec: "avc1.42001f",
    width: W, height: H,
    bitrate: 4_000_000,
    framerate: 30,
  });

  const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 320 });
  const fps = 30;
  const total = Math.ceil(video.duration * fps);

  for (let f = 0; f < total; f++) {
    await seekTo(video, f / fps);
    ctx.drawImage(video, 0, 0, W, H);
    const det = await faceapi.detectSingleFace(canvas, opts).withFaceLandmarks();
    if (det) {
      const b = det.detection.box;
      drawSwappedFace(ctx, src, getFaceTransform(det.landmarks),
        { x: b.x, y: b.y, width: b.width, height: b.height });
    }

    const frame = new VideoFrame(canvas, { timestamp: Math.round((f / fps) * 1_000_000) });
    encoder.encode(frame, { keyFrame: f % 30 === 0 });
    frame.close();

    onProgress((f + 1) / total);
    await new Promise<void>((r) => setTimeout(r, 0));
  }

  await encoder.flush();

  for (const { chunk, meta } of chunks) {
    muxer.addVideoChunk(chunk, meta);
  }
  muxer.finalize();

  URL.revokeObjectURL(videoUrl);
  const blob = new Blob([muxer.target.buffer], { type: "video/mp4" });
  return { url: URL.createObjectURL(blob), ext: "mp4" };
}

// ── browser capability detection ──────────────────────────────────────────

function detectEngine(): "mediarecorder" | "webcodecs" | "unsupported" {
  if (typeof HTMLCanvasElement !== "undefined" &&
      typeof HTMLCanvasElement.prototype.captureStream === "function") {
    return "mediarecorder";
  }
  if (typeof VideoEncoder !== "undefined") {
    return "webcodecs";
  }
  return "unsupported";
}

// ── component ─────────────────────────────────────────────────────────────

export default function VideoFaceSwap() {
  const [status, setStatus] = useState<Status>("loading-models");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ url: string; ext: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [sourceFace, setSourceFace] = useState<SourceFace | null>(null);
  const [engine, setEngine] = useState<"mediarecorder" | "webcodecs" | "unsupported">("mediarecorder");

  useEffect(() => {
    setEngine(detectEngine());
    (async () => {
      try {
        const faceapi = (await import("face-api.js")).default;
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        ]);
        setStatus("idle");
      } catch {
        setError("AIモデルの読み込みに失敗しました。ネットワーク接続を確認してください。");
        setStatus("error");
      }
    })();
  }, []);

  const handleSourceImage = useCallback(async (file: File) => {
    if (status === "loading-models") return;
    const url = URL.createObjectURL(file);
    setSourcePreviewUrl(url);
    setSourceFace(null);
    setError(null);
    setStatus("detecting-source");

    try {
      const img = new Image();
      img.src = url;
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; });

      const faceapi = (await import("face-api.js")).default;
      const det = await faceapi
        .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks();

      if (!det) {
        setError("画像から顔が検出できませんでした。正面を向いた顔が写っている画像をお試しください。");
        setStatus("idle");
        return;
      }

      setSourceFace({ img, transform: getFaceTransform(det.landmarks), previewUrl: url });
      setStatus("idle");
    } catch {
      setError("顔の検出中にエラーが発生しました。");
      setStatus("idle");
    }
  }, [status]);

  const handleProcess = useCallback(async () => {
    if (!sourceFace || !videoFile) return;
    if (engine === "unsupported") {
      setError("お使いのブラウザは対応していません。Chrome・Edge・Safari（iOS 16.4以上）をお使いください。");
      return;
    }

    setStatus("processing");
    setProgress(0);
    setResult(null);
    setError(null);

    try {
      const res = engine === "webcodecs"
        ? await processWebCodecs(videoFile, sourceFace, setProgress)
        : await processMediaRecorder(videoFile, sourceFace, setProgress);
      setResult(res);
      setStatus("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "処理中にエラーが発生しました。");
      setStatus("idle");
    }
  }, [sourceFace, videoFile, engine]);

  const canProcess = !!sourceFace && !!videoFile && status === "idle";

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center gap-3">
        <div className="bg-violet-600 rounded-lg w-8 h-8 flex items-center justify-center font-bold text-sm shrink-0">
          🎭
        </div>
        <div>
          <h1 className="font-bold leading-none">動画フェイススワップ</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            AIで動画内の顔を別の顔に差し替えます（ブラウザ内完結）
          </p>
        </div>
        {status === "loading-models" && (
          <span className="ml-auto text-xs text-yellow-400 animate-pulse">
            AIモデル読み込み中...
          </span>
        )}
      </header>

      <main className="flex-1 flex justify-center px-4 py-8">
        <div className="w-full max-w-2xl space-y-5">
          {error && (
            <div className="bg-red-950 border border-red-800 rounded-xl p-4 text-sm text-red-300">
              {error}
            </div>
          )}

          {/* Step 1 */}
          <section className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
            <h2 className="font-semibold text-gray-200 mb-4 flex items-center gap-2">
              <span className="bg-violet-600 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">1</span>
              差し替え元の顔画像
            </h2>
            <div className="flex gap-4 items-stretch">
              <label className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-gray-700 rounded-xl p-6 cursor-pointer hover:border-violet-500 transition-colors min-h-[120px]">
                <span className="text-3xl mb-2">📸</span>
                <span className="text-sm text-gray-400 text-center">顔画像をタップして選択</span>
                <span className="text-xs text-gray-600 mt-1">JPG / PNG / WebP</span>
                <input type="file" accept="image/*" className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleSourceImage(e.target.files[0])} />
              </label>
              {sourcePreviewUrl && (
                <div className="relative w-28 h-28 shrink-0 self-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={sourcePreviewUrl} alt="差し替え元の顔"
                    className="w-full h-full object-cover rounded-xl border-2 border-gray-700" />
                  {sourceFace && (
                    <div className="absolute -bottom-1 -right-1 bg-green-500 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">✓</div>
                  )}
                  {status === "detecting-source" && (
                    <div className="absolute inset-0 bg-black/60 rounded-xl flex items-center justify-center">
                      <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Step 2 */}
          <section className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
            <h2 className="font-semibold text-gray-200 mb-4 flex items-center gap-2">
              <span className="bg-violet-600 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">2</span>
              差し替え先の動画
            </h2>
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-700 rounded-xl p-6 cursor-pointer hover:border-violet-500 transition-colors min-h-[120px]">
              <span className="text-3xl mb-2">🎬</span>
              {videoFile ? (
                <>
                  <span className="text-sm text-gray-300 text-center truncate max-w-full">{videoFile.name}</span>
                  <span className="text-xs text-gray-500 mt-1">{(videoFile.size / 1024 / 1024).toFixed(1)} MB</span>
                </>
              ) : (
                <>
                  <span className="text-sm text-gray-400">動画をタップして選択</span>
                  <span className="text-xs text-gray-600 mt-1">MP4 / MOV / WebM</span>
                </>
              )}
              <input type="file" accept="video/*" className="hidden"
                onChange={(e) => e.target.files?.[0] && setVideoFile(e.target.files[0])} />
            </label>
          </section>

          {/* Process button */}
          <button onClick={handleProcess} disabled={!canProcess}
            className="w-full py-4 rounded-2xl font-bold text-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-violet-600 hover:bg-violet-500 active:scale-[0.99] shadow-lg shadow-violet-900/40">
            {status === "processing" ? "処理中..." : "フェイススワップ実行"}
          </button>

          {/* Progress */}
          {status === "processing" && (
            <section className="bg-gray-900 rounded-2xl border border-gray-800 p-5 space-y-3">
              <div className="flex justify-between text-sm text-gray-400">
                <span>フレームを処理中...</span>
                <span>{Math.round(progress * 100)}%</span>
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-violet-500 rounded-full transition-all duration-200"
                  style={{ width: `${progress * 100}%` }} />
              </div>
              <p className="text-xs text-gray-500">
                フレームごとに顔を検出・差し替えしています。動画の長さによっては数分かかる場合があります。
              </p>
            </section>
          )}

          {/* Result */}
          {result && (
            <section className="bg-gray-900 rounded-2xl border border-gray-800 p-6 space-y-4">
              <h2 className="font-semibold text-gray-200">完成！</h2>
              <video src={result.url} controls playsInline
                className="w-full rounded-xl border border-gray-700" />
              <a href={result.url} download={`face-swap-result.${result.ext}`}
                className="block w-full py-3 rounded-xl bg-green-600 hover:bg-green-500 text-center font-semibold transition-colors">
                ダウンロード (.{result.ext})
              </a>
            </section>
          )}

          {/* Notes */}
          <div className="rounded-xl p-4 text-xs text-gray-500 space-y-1 border border-gray-800">
            <p className="font-semibold text-gray-400">ご注意</p>
            <p>• すべての処理はブラウザ内で完結し、サーバーへのアップロードはありません</p>
            <p>• iPhone/iPad は Safari（iOS 16.4以上）または Edge・Chrome で使用できます</p>
            <p>• 正面を向いた顔画像を使うと精度が向上します</p>
            <p>• 動画が長い場合は処理に時間がかかります</p>
            <p>• PCはWebM形式、iOS/Macは MP4形式で出力します</p>
          </div>
        </div>
      </main>
    </div>
  );
}
