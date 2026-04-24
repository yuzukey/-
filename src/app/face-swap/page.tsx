import dynamic from "next/dynamic";

const VideoFaceSwap = dynamic(() => import("@/components/VideoFaceSwap"), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400 animate-pulse">読み込み中...</p>
    </div>
  ),
});

export default function FaceSwapPage() {
  return <VideoFaceSwap />;
}
