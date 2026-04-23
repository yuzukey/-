import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "イベント日程共有",
  description: "イベント日程を作成・共有し、Googleカレンダーに追加できます",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="bg-slate-50 min-h-screen text-slate-800 antialiased">
        {children}
      </body>
    </html>
  );
}
