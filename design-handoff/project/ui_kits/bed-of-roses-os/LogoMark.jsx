// LogoMark — geometric four-fold rose. Uses copied SVG from assets/.
function LogoMark({ size = 80, withWordmark = false, color = "currentColor" }) {
  const stroke = color;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} style={{ display: "block" }} aria-hidden="true">
      <g fill="none" stroke={stroke} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4">
        {/* Outer petals */}
        <path d="M32 6 C 38 18, 46 26, 58 32 C 46 38, 38 46, 32 58 C 26 46, 18 38, 6 32 C 18 26, 26 18, 32 6 Z" opacity="0.95" />
        {/* Rotated inner petals */}
        <g transform="rotate(45 32 32)">
          <path d="M32 12 C 36 20, 44 28, 52 32 C 44 36, 36 44, 32 52 C 28 44, 20 36, 12 32 C 20 28, 28 20, 32 12 Z" opacity="0.7" />
        </g>
        {/* Tighter core */}
        <path d="M32 18 C 35 24, 40 29, 46 32 C 40 35, 35 40, 32 46 C 29 40, 24 35, 18 32 C 24 29, 29 24, 32 18 Z" opacity="0.55" />
        {/* Bud */}
        <circle cx="32" cy="32" r="2.4" fill={stroke} stroke="none" />
      </g>
    </svg>
  );
}

function HeroRose({ size = 96 }) {
  return (
    <div className="hero-rose-wrap" style={{ width: size, height: size }}>
      <LogoMark size={size} color="rgba(255,255,255,0.85)" />
      <span className="pulse" />
    </div>
  );
}

Object.assign(window, { LogoMark, HeroRose });
