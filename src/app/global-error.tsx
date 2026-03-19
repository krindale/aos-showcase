'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ko" className="dark">
      <body className="antialiased min-h-screen flex flex-col items-center justify-center bg-[#0a0a0f] text-[#f5f5f5]">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold">문제가 발생했습니다</h2>
          <p className="text-[#a0a0a0]">{error.message}</p>
          <button
            onClick={reset}
            className="px-6 py-2 rounded-lg bg-[#d4a853] text-[#0a0a0f] font-medium hover:bg-[#e6c77a] transition-colors"
          >
            다시 시도
          </button>
        </div>
      </body>
    </html>
  );
}
