'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ko">
      <body className="antialiased min-h-screen flex flex-col items-center justify-center bg-[#f7f5f0] text-[#1c1b18]">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold">문제가 발생했습니다</h2>
          <p className="text-[#6e6a61]">{error.message}</p>
          <button
            onClick={reset}
            className="px-6 py-2 rounded-lg bg-[#c04a2b] text-[#fffdf8] font-medium hover:bg-[#d65a39] transition-colors"
          >
            다시 시도
          </button>
        </div>
      </body>
    </html>
  );
}
