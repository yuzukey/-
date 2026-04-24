"use client";

import { useState, useCallback, useEffect } from "react";

const MODEL_URL =
  "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights";

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
  avgColor: { r: number; g: number; b: number };
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

function sampleAvgColor(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number
): { r: number; g: number; b: number } {
  const cx = Math.max(0, Math.round(x));
  const cy = Math.max(0, Math.round(y));
  const cw = Math.min(Math.round(w), ctx.canvas.width - cx);
  const ch = Math.min(Math.round(h), ctx.canvas.height - cy);
  if (cw <= 0 || ch <= 0) return { r: 128, g: 128, b: 128 };
  const d = ctx.getImageData(cx, cy, cw, ch).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] > 64) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
  }
  return { r: r / (n || 1), g: g / (n || 1), b: b / (n || 1) };
}

function applyColorShift(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  shift: { r: number; g: number; b: number },
  strength = 0.65
) {
  const clamp = (v: number) => Math.min(255, Math.max(0, Math.round(v)));
  const cx = Math.max(0, Math.round(x));
  const cy = Math.max(0, Math.round(y));
  const cw = Math.min(Math.round(w), ctx.canvas.width - cx);
  const ch = Math.min(Math.round(h), ctx.canvas.height - cy);
  if (cw <= 0 || ch <= 0) return;
  const img = ctx.getImageData(cx, cy, cw, ch);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] > 0) {
      d[i]     = clamp(d[i]     + shift.r * strength);
      d[i + 1] = clamp(d[i + 1] + shift.g * strength);
      d[i + 2] = clamp(d[i + 2] + shift.b * strength);
    }
  }
  ctx.putImageData(img, cx, cy);
}

function createPolygonMask(
  W: number, H: number,
  landmarks: {
    getJawOutline: () => Array<{ x: number; y: number }>;
    getLeftEyeBrow: () => Array<{ x: number; y: number }>;
    getRightEyeBrow: () => Array<{ x: number; y: number }>;
  }
): HTMLCanvasElement {
  const mask = document.createElement("canvas");
  mask.width = W; mask.height = H;
  const ctx = mask.getContext("2d")!;

  const jaw = landmarks.getJawOutline();
  const lBrow = landmarks.getLeftEyeBrow();
  const rBrow = landmarks.getRightEyeBrow();

  const browY = Math.min(...lBrow.map(p => p.y), ...rBrow.map(p => p.y));
  const chinY = jaw[8].y;
  const blurR = Math.max(8, (chinY - browY) * 0.07);
  const foreheadY = browY - (chinY - browY) * 0.45;

  ctx.shadowColor = "white";
  ctx.shadowBlur = blurR;
  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.moveTo(jaw[0].x, jaw[0].y);
  jaw.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(rBrow[rBrow.length - 1].x, foreheadY);
  ctx.lineTo(lBrow[0].x, foreheadY);
  ctx.closePath();
  ctx.fill();

  return mask;
}

function drawSwappedFace(
  ctx: CanvasRenderingContext2D,
  src: SourceFace,
  tgt: FaceTransform,
  tgtLandmarks: {
    getJawOutline: () => Array<{ x: number; y: number }>;
    getLeftEyeBrow: () => Array<{ x: number; y: number }>;
    getRightEyeBrow: () => Array<{ x: number; y: number }>;
  },
  box: { x: number; y: number; width: number; height: number }
) {
  const scale = tgt.eyeDistance / src.transform.eyeDistance;
  const rot = tgt.angle - src.transform.angle;
  const W = ctx.canvas.width, H = ctx.canvas.height;

  // Draw transformed source face onto temp canvas
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

  // Color correction: match source face color to target face color
  const tgtAvg = sampleAvgColor(ctx, box.x, box.y, box.width, box.height);
  const shift = {
    r: tgtAvg.r - src.avgColor.r,
    g: tgtAvg.g - src.avgColor.g,
    b: tgtAvg.b - src.avgColor.b,
  };
  applyColorShift(tmpCtx, box.x, box.y, box.width, box.height, shift);

  // Apply face polygon mask (soft edges)
  const mask = createPolygonMask(W, H, tgtLandmarks);
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

// ── audio muxing (second pass, PC/Android only) ───────────────────────────

async function addAudio(
  processedUrl: string,
  originalFile: File
): Promise<string> {
  const origUrl = URL.createObjectURL(originalFile);

  const origVideo = document.createElement("video");
  origVideo.src = origUrl;
  origVideo.muted = false;
  origVideo.crossOrigin = "anonymous";

  const processedVideo = document.createElement("video");
  processedVideo.src = processedUrl;
  processedVideo.muted = true;

  await Promise.all([
    new Promise<void>((res) => { origVideo.onloadedmetadata = () => res(); origVideo.load(); }),
    new Promise<void>((res) => { processedVideo.onloadedmetadata = () => res(); processedVideo.load(); }),
  ]);

  // Check if original has audio
  const origStream = (origVideo as HTMLVideoElement & { captureStream(): MediaStream }).captureStream();
  const audioTracks = origStream.getAudioTracks();
  if (audioTracks.length === 0) {
    URL.revokeObjectURL(origUrl);
    return processedUrl;
  }

  const W = processedVideo.videoWidth, H = processedVideo.videoHeight;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  const combined = new MediaStream([
    ...canvas.captureStream(30).getVideoTracks(),
    ...audioTracks,
  ]);

  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
    ? "video/webm;codecs=vp9,opus" : "video/webm";
  const recorder = new MediaRecorder(combined, { mimeType });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  const done = new Promise<string>((resolve) => {
    recorder.onstop = () => {
      URL.revokeObjectURL(origUrl);
      resolve(URL.createObjectURL(new Blob(chunks, { type: "video/webm" })));
    };
  });

  recorder.start(100);
  origVideo.currentTime = 0;
  processedVideo.currentTime = 0;
  await Promise.all([origVideo.play(), processedVideo.play()]);

  await new Promise<void>((resolve) => {
    const draw = () => {
      if (processedVideo.ended || processedVideo.paused) {
        recorder.stop();
        resolve();
        return;
      }
      ctx.drawImage(processedVideo, 0, 0, W, H);
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  });

  return done;
}

// ── processing: MediaRecorder (PC / Android) ──────────────────────────────

async function processMediaRecorder(
  videoFile: File,
  src: SourceFace,
  onProgress: (p: number) => void
): Promise<{ url: string; ext: string }> {
  const faceapi = await import("face-api.js").then(m => m.default ?? m);
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

  const silentDone = new Promise<string>((res) => {
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
      drawSwappedFace(ctx, src, getFaceTransform(det.landmarks), det.landmarks,
        { x: b.x, y: b.y, width: b.width, height: b.height });
    }
    onProgress((f + 1) / total * 0.85);
    await new Promise<void>((r) => setTimeout(r, 0));
  }

  recorder.stop();
  const silentUrl = await silentDone;

  // Second pass: add original audio
  onProgress(0.88);
  const withAudio = await addAudio(silentUrl, videoFile);
  onProgress(1);

  return { url: withAudio, ext: "webm" };
}

// ── processing: WebCodecs + mp4-muxer (iOS 16.4+) ────────────────────────

async function processWebCodecs(
  videoFile: File,
  src: SourceFace,
  onProgress: (p: number) => void
): Promise<{ url: string; ext: string }> {
  const faceapi = await import("face-api.js").then(m => m.default ?? m);
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
  encoder.configure({ codec: "avc1.42001f", width: W, height: H, bitrate: 4_000_000, framerate: 30 });

  const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 320 });
  const fps = 30;
  const total = Math.ceil(video.duration * fps);

  for (let f = 0; f < total; f++) {
    await seekTo(video, f / fps);
    ctx.drawImage(video, 0, 0, W, H);
    const det = await faceapi.detectSingleFace(canvas, opts).withFaceLandmarks();
    if (det) {
      const b = det.detection.box;
      drawSwappedFace(ctx, src, getFaceTransform(det.landmarks), det.landmarks,
        { x: b.x, y: b.y, width: b.width, height: b.height });
    }
    const frame = new VideoFrame(canvas, { timestamp: Math.round((f / fps) * 1_000_000) });
    encoder.encode(frame, { keyFrame: f % 30 === 0 });
    frame.close();
    onProgress((f + 1) / total);
    await new Promise<void>((r) => setTimeout(r, 0));
  }

  await encoder.flush();
  for (const { chunk, meta } of chunks) muxer.addVideoChunk(chunk, meta);
  muxer.finalize();

  URL.revokeObjectURL(videoUrl);
  return {
    url: URL.createObjectURL(new Blob([muxer.target.buffer], { type: "video/mp4" })),
    ext: "mp4",
  };
}

// ── browser capability detection ──────────────────────────────────────────

function detectEngine(): "mediarecorder" | "webcodecs" | "unsupported" {
  if (typeof HTMLCanvasElement !== "undefined" &&
    typeof HTMLCanvasElement.prototype.captureStream === "function") return "mediarecorder";
  if (typeof VideoEncoder !== "undefined") return "webcodecs";
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
        const faceapi = await import("face-api.js").then(m => m.default ?? m);
        const urls = [
          "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights",
        ];
        let loaded = false;
        let lastErr: unknown;
        for (const url of urls) {
          try {
            await Promise.all([
              faceapi.nets.tinyFaceDetector.loadFromUri(url),
              faceapi.nets.faceLandmark68Net.loadFromUri(url),
            ]);
            loaded = true;
            break;
          } catch (e) { lastErr = e; }
        }
        if (!loaded) throw lastErr;
        setStatus("idle");
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(`AIモデルの読み込みに失敗しました。(${msg})`);
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

      const faceapi = await import("face-api.js").then(m => m.default ?? m);
      const det = await faceapi
        .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks();

      if (!det) {
        setError("画像から顔が検出できませんでした。正面を向いた顔が写っている画像をお試しください。");
        setStatus("idle");
        return;
      }

      const transform = getFaceTransform(det.landmarks);

      // Precompute source face average color for color correction
      const tmpCanvas = document.createElement("canvas");
      tmpCanvas.width = img.width; tmpCanvas.height = img.height;
      const tmpCtx = tmpCanvas.getContext("2d")!;
      tmpCtx.drawImage(img, 0, 0);
      const avgColor = sampleAvgColor(
        tmpCtx,
        transform.center.x - transform.eyeDistance,
        transform.center.y - transform.eyeDistance * 0.5,
        transform.eyeDistance * 2,
        transform.eyeDistance * 2.5
      );

      setSourceFace({ img, transform, previewUrl: url, avgColor });
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

  const progressLabel =
    progress < 0.86 ? `フレーム処理中... ${Math.round(progress / 0.85 * 100)}%`
    : progress < 1   ? "音声を合成中..."
    :                  "完了";

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center gap-3">
        <div className="bg-violet-600 rounded-lg w-8 h-8 flex items-center justify-center font-bold text-sm shrink-0">🎭</div>
        <div>
          <h1 className="font-bold leading-none">動画フェイススワップ</h1>
          <p className="text-xs text-gray-400 mt-0.5">AIで動画内の顔を別の顔に差し替えます（ブラウザ内完結）</p>
        </div>
        {status === "loading-models" && (
          <span className="ml-auto text-xs text-yellow-400 animate-pulse">AIモデル読み込み中...</span>
        )}
      </header>

      <main className="flex-1 flex justify-center px-4 py-8">
        <div className="w-full max-w-2xl space-y-5">
          {error && (
            <div className="bg-red-950 border border-red-800 rounded-xl p-4 text-sm text-red-300">{error}</div>
          )}

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

          <button onClick={handleProcess} disabled={!canProcess}
            className="w-full py-4 rounded-2xl font-bold text-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-violet-600 hover:bg-violet-500 active:scale-[0.99] shadow-lg shadow-violet-900/40">
            {status === "processing" ? "処理中..." : "フェイススワップ実行"}
          </button>

          {status === "processing" && (
            <section className="bg-gray-900 rounded-2xl border border-gray-800 p-5 space-y-3">
              <div className="flex justify-between text-sm text-gray-400">
                <span>{progressLabel}</span>
                <span>{Math.round(progress * 100)}%</span>
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-violet-500 rounded-full transition-all duration-300"
                  style={{ width: `${progress * 100}%` }} />
              </div>
              <p className="text-xs text-gray-500">動画の長さによっては数分かかる場合があります。タブを閉じないでください。</p>
            </section>
          )}

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

          <div className="rounded-xl p-4 text-xs text-gray-500 space-y-1 border border-gray-800">
            <p className="font-semibold text-gray-400">ご注意</p>
            <p>• すべての処理はブラウザ内で完結します</p>
            <p>• 正面を向いた顔画像を使うと精度が向上します</p>
            <p>• iPhone は Safari（iOS 16.4以上）で使用できます（iOSは音声なし）</p>
            <p>• PCはWebM形式、iOSはMP4形式で出力します</p>
          </div>
        </div>
      </main>
    </div>
  );
}
