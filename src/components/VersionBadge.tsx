export function VersionBadge() {
  const built = new Date(__BUILT_AT__);
  const builtLocal = built.toLocaleString();
  return (
    <div
      className="fixed bottom-2 right-2 text-[10px] text-gray-400 font-mono select-none pointer-events-none"
      title={`Built at ${builtLocal}`}
    >
      v{__APP_VERSION__}
    </div>
  );
}
