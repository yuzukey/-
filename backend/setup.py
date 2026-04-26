"""
初回セットアップスクリプト
実行: python setup.py
"""
import sys
import subprocess
import shutil
from pathlib import Path

MODELS_DIR = Path(__file__).parent / "models"
MODEL_FILE = MODELS_DIR / "inswapper_128.onnx"
MIN_SIZE = 400_000_000  # 400MB以上なら正常


def step(msg: str):
    print(f"\n▶ {msg}")


def ok(msg: str):
    print(f"  ✓ {msg}")


def fail(msg: str):
    print(f"  ✗ {msg}")
    sys.exit(1)


# ── Python バージョン確認 ─────────────────────────────────────────────────────

step("Python バージョン確認")
major, minor = sys.version_info.major, sys.version_info.minor
if major != 3 or minor < 9 or minor > 12:
    print(f"  現在のバージョン: Python {major}.{minor}")
    print()
    print("  insightface は Python 3.9〜3.12 のみ対応しています。")
    print("  python.org から Python 3.11 をインストールし、")
    print("  次のコマンドで再実行してください:")
    print()
    print("      py -3.11 setup.py")
    print()
    sys.exit(1)
ok(f"Python {major}.{minor}")

# ── 依存パッケージのインストール ───────────────────────────────────────────────

step("依存パッケージをインストール中...")
subprocess.run(
    [sys.executable, "-m", "pip", "install", "-r",
     str(Path(__file__).parent / "requirements.txt")],
    check=True,
)
ok("インストール完了")

# ── モデルのダウンロード ──────────────────────────────────────────────────────

step("inswapper_128.onnx モデルを確認中...")
MODELS_DIR.mkdir(exist_ok=True)

if MODEL_FILE.exists() and MODEL_FILE.stat().st_size >= MIN_SIZE:
    ok(f"モデルは既に存在します: {MODEL_FILE}")
else:
    print("  モデルをダウンロードします（約500MB）...")

    # InsightFace のデフォルトダウンロード先を確認
    downloaded = False
    try:
        import insightface
        model = insightface.model_zoo.get_model("inswapper_128.onnx")
        # デフォルト保存先を探す
        candidates = [
            Path.home() / ".insightface" / "models" / "inswapper_128.onnx",
            Path.home() / ".insightface" / "models" / "inswapper_128" / "inswapper_128.onnx",
        ]
        for c in candidates:
            if c.exists() and c.stat().st_size >= MIN_SIZE:
                shutil.copy(c, MODEL_FILE)
                ok(f"モデルをコピーしました: {MODEL_FILE}")
                downloaded = True
                break
    except Exception as e:
        print(f"  自動ダウンロード失敗: {e}")

    if not downloaded:
        print("\n" + "=" * 60)
        print("【手動ダウンロードが必要です】")
        print("")
        print("以下のいずれかから inswapper_128.onnx をダウンロードし、")
        print(f"次のフォルダに配置してください:")
        print(f"  {MODEL_FILE}")
        print("")
        print("配置後、もう一度 python setup.py を実行してください。")
        print("=" * 60)
        sys.exit(1)

# ── 完了 ─────────────────────────────────────────────────────────────────────

print("\n" + "=" * 60)
print("セットアップ完了！")
print("")
print("バックエンドを起動するには:")
print("  cd backend")
print("  python main.py")
print("")
print("フロントエンドを起動するには（別のコマンドプロンプトで）:")
print("  npm run dev")
print("=" * 60)
