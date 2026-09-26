'use client';

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="space-y-3 rounded border bg-white p-6 text-center">
      <p>エラーが発生しました</p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded bg-blue-600 px-4 py-2 font-bold text-white"
      >
        もう一度試す
      </button>
    </div>
  );
}
