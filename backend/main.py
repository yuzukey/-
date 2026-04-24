import os
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

    print("顔検出モデル読み込み中...")
    _face_analyser = FaceAnalysis(
        name="buffalo_l",
        providers=["CUDAExecutionProvider", "CPUExecutionProvider"],
    )
    _face_analyser.prepare(ctx_id=0, det_size=(640, 640))

    print("顔変換モデル読み込み中...")
    _swapper = insightface.model_zoo.get_model(str(INSWAPPER_PATH))

    print("モデル読み込み完了")
    return _face_analyser, _swapper


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

        # 複数画像の場合は埋め込みを平均化（精度向上）
        if len(all_embeddings) > 1:
            avg = np.mean(all_embeddings, axis=0)
            ref_face.normed_embedding = avg / np.linalg.norm(avg)

        source_face = ref_face

        # 動画処理
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise HTTPException(400, detail="動画ファイルを開けませんでした")

        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        print(f"処理開始: {total}フレーム, {fps:.1f}fps, {w}x{h}")

        silent_path = os.path.join(tmp_dir, "silent.mp4")
        out = cv2.VideoWriter(silent_path, cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))

        n = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            faces = face_analyser.get(frame)
            result = frame.copy()
            for tgt in faces:
                result = swapper.get(result, tgt, source_face, paste_back=True)
            out.write(result)
            n += 1
            if n % 30 == 0:
                print(f"  {n}/{total} フレーム完了")

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
