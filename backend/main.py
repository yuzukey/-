import os
import gc
import cv2
import numpy as np
import tempfile
import shutil
import subprocess
from pathlib import Path
from typing import List

from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

# ── 処理設定 ─────────────────────────────────────────────────────────────────
# 処理時の最大高さ（ピクセル）。元動画がこれより大きい場合は縮小して処理し、最後に戻す。
# 小さくするほど高速・低負荷。品質を優先する場合は 1080 に上げる。
PROC_MAX_HEIGHT = 720

# 顔検出サイズ。(320, 320) が低負荷、(640, 640) が高精度。
DET_SIZE = (320, 320)

# ── Model paths ───────────────────────────────────────────────────────────────

MODELS_DIR = Path(__file__).parent / "models"
INSWAPPER_PATH = MODELS_DIR / "inswapper_128.onnx"

_face_analyser = None
_swapper = None


def load_models():
    global _face_analyser, _swapper
    if _face_analyser is not None:
        return _face_analyser, _swapper

    try:
        import insightface
        from insightface.app import FaceAnalysis
    except ImportError:
        raise RuntimeError("insightface が見つかりません。setup.py を実行してください。")

    if not INSWAPPER_PATH.exists():
        raise RuntimeError(
            f"モデルが見つかりません: {INSWAPPER_PATH}\n"
            "python setup.py を実行してモデルをダウンロードしてください。"
        )

    # GPU (CUDA) を優先し、なければ CPU にフォールバック
    providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]

    print("顔検出モデル読み込み中...")
    _face_analyser = FaceAnalysis(name="buffalo_l", providers=providers)
    _face_analyser.prepare(ctx_id=0, det_size=DET_SIZE)

    print("顔変換モデル読み込み中...")
    _swapper = insightface.model_zoo.get_model(
        str(INSWAPPER_PATH), providers=providers
    )

    # 使用中のプロバイダを表示
    try:
        import onnxruntime as ort
        available = ort.get_available_providers()
        using_gpu = "CUDAExecutionProvider" in available
        print(f"実行デバイス: {'GPU (CUDA)' if using_gpu else 'CPU'}")
    except Exception:
        pass

    print("モデル読み込み完了")
    return _face_analyser, _swapper


def _seamless_blend(original: np.ndarray, swapped: np.ndarray, face) -> np.ndarray:
    fh, fw = original.shape[:2]
    bbox = face.bbox.astype(int)
    x1 = max(5, min(fw - 6, bbox[0]))
    y1 = max(5, min(fh - 6, bbox[1]))
    x2 = max(5, min(fw - 6, bbox[2]))
    y2 = max(5, min(fh - 6, bbox[3]))
    if x2 <= x1 or y2 <= y1:
        return swapped
    cx = (x1 + x2) // 2
    cy = (y1 + y2) // 2
    rx = max(1, int((x2 - x1) // 2 * 0.85))
    ry = max(1, int((y2 - y1) // 2 * 0.92))
    mask = np.zeros((fh, fw), dtype=np.uint8)
    cv2.ellipse(mask, (cx, cy), (rx, ry), 0, 0, 360, 255, -1)
    try:
        return cv2.seamlessClone(swapped, original, mask, (cx, cy), cv2.NORMAL_CLONE)
    except Exception:
        return swapped


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="Face Swap API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    try:
        load_models()
    except Exception as e:
        print(f"起動時モデル読み込みスキップ: {e}")


@app.get("/health")
def health():
    return {"status": "ok", "model_ready": _face_analyser is not None}


@app.post("/swap")
async def swap_faces(
    background_tasks: BackgroundTasks,
    sources: List[UploadFile] = File(...),
    video: UploadFile = File(...),
):
    face_analyser, swapper = load_models()
    tmp_dir = tempfile.mkdtemp()

    try:
        # 動画を保存
        suffix = Path(video.filename or "input.mp4").suffix or ".mp4"
        video_path = os.path.join(tmp_dir, f"input{suffix}")
        with open(video_path, "wb") as f:
            f.write(await video.read())

        # ソース画像から顔埋め込みを取得
        all_embeddings = []
        ref_face = None

        for src_file in sources:
            data = await src_file.read()
            img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
            if img is None:
                continue
            faces = face_analyser.get(img)
            if not faces:
                continue
            face = max(faces, key=lambda f: f.det_score)
            all_embeddings.append(face.normed_embedding)
            if ref_face is None:
                ref_face = face

        if not all_embeddings:
            raise HTTPException(400, detail="ソース画像から顔を検出できませんでした")

        if len(all_embeddings) > 1:
            from types import SimpleNamespace
            avg = np.mean(all_embeddings, axis=0)
            source_face = SimpleNamespace(normed_embedding=avg / np.linalg.norm(avg))
        else:
            source_face = ref_face

        # 動画処理
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise HTTPException(400, detail="動画ファイルを開けませんでした")

        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        # 処理解像度を決定（大きい動画は縮小して処理）
        scale = min(1.0, PROC_MAX_HEIGHT / h) if h > PROC_MAX_HEIGHT else 1.0
        proc_w = int(w * scale)
        proc_h = int(h * scale)
        print(f"処理開始: {total}フレーム, {fps:.1f}fps, 元{w}x{h} → 処理{proc_w}x{proc_h}")

        silent_path = os.path.join(tmp_dir, "silent.mp4")
        out = cv2.VideoWriter(silent_path, cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))

        n = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            # 縮小して処理
            proc = cv2.resize(frame, (proc_w, proc_h)) if scale < 1.0 else frame

            faces = face_analyser.get(proc)
            result = proc.copy()
            for tgt in faces:
                original = result.copy()
                swapped = swapper.get(result, tgt, source_face, paste_back=True)
                result = _seamless_blend(original, swapped, tgt)

            # 元サイズに戻して書き込み
            if scale < 1.0:
                result = cv2.resize(result, (w, h))
            out.write(result)

            n += 1
            if n % 30 == 0:
                print(f"  {n}/{total} フレーム完了")
                gc.collect()  # 定期的にメモリ解放

        cap.release()
        out.release()

        # 音声を元動画からコピー
        out_path = os.path.join(tmp_dir, "output.mp4")
        try:
            r = subprocess.run(
                [
                    "ffmpeg", "-y",
                    "-i", silent_path,
                    "-i", video_path,
                    "-c:v", "copy",
                    "-c:a", "aac", "-b:a", "192k",
                    "-map", "0:v:0",
                    "-map", "1:a:0?",
                    "-shortest",
                    out_path,
                ],
                capture_output=True,
                timeout=600,
            )
            if r.returncode != 0:
                shutil.copy(silent_path, out_path)
        except (FileNotFoundError, subprocess.TimeoutExpired):
            shutil.copy(silent_path, out_path)

        print("完了!")
        background_tasks.add_task(shutil.rmtree, tmp_dir, True)
        return FileResponse(out_path, media_type="video/mp4", filename="swapped.mp4")

    except HTTPException:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise
    except Exception as e:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise HTTPException(500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
