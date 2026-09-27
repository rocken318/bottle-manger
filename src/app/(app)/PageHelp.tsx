/** Collapsible "how to use" note shown at the top of a page (closed by default). */
export function PageHelp({ children }: { children: React.ReactNode }) {
  return (
    <details className="rounded border bg-white p-3 text-sm">
      <summary className="cursor-pointer font-bold text-blue-700">
        <span
          aria-hidden="true"
          className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-xs text-white"
        >
          ?
        </span>
        使い方
      </summary>
      <div className="mt-2 space-y-2 text-gray-700 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">{children}</div>
    </details>
  );
}
