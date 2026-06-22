"use client";

export default function LeadersError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="p-8 text-center">
      <h2 className="text-xl font-bold text-danger">Leaders page error</h2>
      <p className="mt-2 text-sm text-ink-muted">{error.message}</p>
      {error.digest && (
        <p className="mt-1 text-xs text-ink-faint">Digest: {error.digest}</p>
      )}
      <pre className="mx-auto mt-4 max-w-lg overflow-auto rounded-lg bg-surface-2 p-4 text-left text-xs">
        {error.stack}
      </pre>
      <button
        onClick={reset}
        className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white"
      >
        Try again
      </button>
    </div>
  );
}
