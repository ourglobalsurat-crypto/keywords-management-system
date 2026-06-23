// Brand logos recreated as transparent, scalable SVGs.
//
// - Global Surat (the agency that built this app): orange cable-stayed bridge
//   mark + "Global" (black) / "Surat" (orange) wordmark + tagline. Fully
//   transparent so it sits on any background.
// - Medallion Fence (the client whose Google Ads account this manages):
//   navy square "MF" monogram + wordmark.

export const BRAND_ORANGE = "#E8742C";
export const BRAND_NAVY = "#21406B";

/* ───────────────────────── Global Surat ───────────────────────── */

export function GlobalSuratMark({ className }: { className?: string }) {
  // Two towers with fanned cables + deck — the cable-stayed bridge silhouette.
  const deckY = 78;
  const towerTopY = 16;
  const leftX = 64;
  const rightX = 136;
  const leftCables = [16, 28, 40, 52, 76, 88, 100];
  const rightCables = [100, 112, 124, 148, 160, 172, 184];
  return (
    <svg
      viewBox="0 0 200 96"
      className={className}
      fill="none"
      stroke={BRAND_ORANGE}
      strokeLinecap="round"
      aria-hidden="true"
    >
      {/* deck */}
      <line x1="8" y1={deckY} x2="192" y2={deckY} strokeWidth="3.5" />
      {/* towers */}
      <line x1={leftX} y1={towerTopY} x2={leftX} y2="90" strokeWidth="3.5" />
      <line x1={rightX} y1={towerTopY} x2={rightX} y2="90" strokeWidth="3.5" />
      {/* cables */}
      {leftCables.map((x) => (
        <line key={`l${x}`} x1={leftX} y1={towerTopY + 2} x2={x} y2={deckY} strokeWidth="1.4" />
      ))}
      {rightCables.map((x) => (
        <line key={`r${x}`} x1={rightX} y1={towerTopY + 2} x2={x} y2={deckY} strokeWidth="1.4" />
      ))}
    </svg>
  );
}

export function GlobalSuratLogo({
  className,
  tagline = true,
}: {
  className?: string;
  tagline?: boolean;
}) {
  return (
    <div className={className}>
      <GlobalSuratMark className="mx-auto h-10 w-auto" />
      <div className="mt-1 text-center">
        <span className="text-2xl font-extrabold tracking-tight text-slate-900">Global</span>
        <span className="text-2xl font-extrabold tracking-tight" style={{ color: BRAND_ORANGE }}>
          {" "}
          Surat
        </span>
      </div>
      {tagline && (
        <p
          className="mt-0.5 text-center text-[11px] font-semibold"
          style={{ color: BRAND_ORANGE }}
        >
          Just identify your business with global surat
        </p>
      )}
    </div>
  );
}

/** Compact inline lockup: small bridge mark + "Global Surat" text. */
export function GlobalSuratInline({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ""}`}>
      <GlobalSuratMark className="h-3.5 w-auto" />
      <span className="font-bold text-slate-800">Global</span>
      <span className="font-bold" style={{ color: BRAND_ORANGE }}>
        Surat
      </span>
    </span>
  );
}

/** "Application made by Global Surat" credit line. */
export function MadeByGlobalSurat({ className }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-2 ${className ?? ""}`}>
      <GlobalSuratMark className="h-4 w-auto" />
      <span className="text-xs text-slate-500">
        Application made by{" "}
        <span className="font-semibold text-slate-700">Global</span>
        <span className="font-semibold" style={{ color: BRAND_ORANGE }}>
          {" "}
          Surat
        </span>
      </span>
    </div>
  );
}

/* ───────────────────────── Medallion Fence ───────────────────────── */

export function MedallionFenceMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 88" className={className} aria-hidden="true">
      {/* navy square frame */}
      <rect
        x="6"
        y="6"
        width="88"
        height="76"
        rx="3"
        fill="none"
        stroke={BRAND_NAVY}
        strokeWidth="9"
      />
      {/* MF monogram */}
      <text
        x="50"
        y="60"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight="800"
        fontSize="46"
        letterSpacing="-2"
      >
        <tspan fill="#111827">M</tspan>
        <tspan fill={BRAND_NAVY}>F</tspan>
      </text>
    </svg>
  );
}

export function MedallionFenceLogo({ className }: { className?: string }) {
  return (
    <div className={`flex flex-col items-center ${className ?? ""}`}>
      <MedallionFenceMark className="h-14 w-auto" />
      <div className="mt-2 text-sm font-extrabold tracking-[0.18em] text-slate-900">
        MEDALLION FENCE
      </div>
    </div>
  );
}
