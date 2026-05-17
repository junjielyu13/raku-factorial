export const BRAND = 'Raku Sant Cugat';

export function BrandWatermark() {
  return (
    <div
      className="fixed bottom-2 left-2 text-[11px] text-slate-400 select-none pointer-events-none tracking-wide"
      aria-hidden="true"
    >
      {BRAND}
    </div>
  );
}
