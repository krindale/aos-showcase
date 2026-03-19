'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-4">
      <h2 className="text-2xl font-bold text-foreground">문제가 발생했습니다</h2>
      <p className="text-foreground-secondary">{error.message}</p>
      <button
        onClick={reset}
        className="btn-primary px-6 py-2 rounded-lg"
      >
        다시 시도
      </button>
    </div>
  );
}
