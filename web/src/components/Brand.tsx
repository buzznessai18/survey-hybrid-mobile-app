import { Link } from "react-router-dom";

/** The same leaf mark as the mobile app (mobile/src/components/ui/Brand.tsx). */
export function LeafLogo({ size = 32, color = "#ffffff", vein = "#168A4A" }: { size?: number; color?: string; vein?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <path d="M32 6c9 8 13 17 13 25 0 8-5.5 14-13 14S19 39 19 31c0-8 4-17 13-25z" fill={color} />
      <path d="M32 44c6-8 15-11 24-10-2 11-10 18-21 18h-3v-8z" fill={color} opacity={0.92} />
      <path d="M32 44c-6-8-15-11-24-10 2 11 10 18 21 18h3v-8z" fill={color} opacity={0.92} />
      <rect x={30.5} y={20} width={3} height={38} rx={1.5} fill={vein} opacity={0.55} />
    </svg>
  );
}

export function Wordmark({ to = "/", light }: { to?: string; light?: boolean }) {
  return (
    <Link to={to} className={`wordmark${light ? " wordmark-light" : ""}`} aria-label="Field Survey home">
      <span className="wordmark-badge">
        <LeafLogo size={22} color={light ? "#145c38" : "#ffffff"} vein={light ? "#e5f2ea" : "#0d4029"} />
      </span>
      <span>Field Survey</span>
    </Link>
  );
}
