// src/components/ErrorBanner.tsx
export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="bg-red-50 border border-red-300 text-red-800 px-4 py-2 rounded">{message}</div>;
}
