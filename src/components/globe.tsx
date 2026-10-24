/**
 * The JutaOne globe. Pure SVG + CSS transforms: no video, no GIF, no canvas.
 * Rendered markup is under 3KB and only `transform` animates, so it holds 60fps
 * on mid-range phones. Motion is disabled by the global
 * `prefers-reduced-motion` rule in globals.css.
 */
type GlobeProps = {
  size: number;
  /** Keeps gradient/clip ids unique when several globes share a document. */
  id: string;
  className?: string;
  label?: string;
  decorative?: boolean;
};

const MERIDIAN_X = [-64, -48, -32, -16, 0, 16, 32, 48, 64, 80, 96, 112, 128];

export function Globe({ size, id, className, label, decorative = false }: GlobeProps) {
  const sphereId = `globe-sphere-${id}`;
  const clipId = `globe-clip-${id}`;
  const sheenId = `globe-sheen-${id}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role={decorative ? "presentation" : "img"}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative || undefined}
      focusable="false"
    >
      <defs>
        <radialGradient id={sphereId} cx="34%" cy="26%" r="78%">
          <stop offset="0%" stopColor="#fff4d1" />
          <stop offset="42%" stopColor="#f6ca5d" />
          <stop offset="78%" stopColor="#d99a22" />
          <stop offset="100%" stopColor="#8a5b12" />
        </radialGradient>
        <radialGradient id={sheenId} cx="30%" cy="22%" r="55%">
          <stop offset="0%" stopColor="#fffdf5" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#fffdf5" stopOpacity="0" />
        </radialGradient>
        <clipPath id={clipId}>
          <circle cx="32" cy="32" r="29" />
        </clipPath>
      </defs>

      <circle cx="32" cy="32" r="29" fill={`url(#${sphereId})`} />

      <g clipPath={`url(#${clipId})`} opacity="0.72">
        <g className="globe__meridians">
          {MERIDIAN_X.map((x) => (
            <ellipse
              key={x}
              cx={x}
              cy="32"
              rx="7"
              ry="29"
              fill="none"
              stroke="#6b4408"
              strokeWidth="0.7"
              strokeOpacity="0.55"
            />
          ))}
        </g>
        <ellipse cx="32" cy="32" rx="29" ry="10" fill="none" stroke="#6b4408" strokeWidth="0.7" strokeOpacity="0.45" />
        <ellipse cx="32" cy="32" rx="29" ry="19" fill="none" stroke="#6b4408" strokeWidth="0.7" strokeOpacity="0.4" />
        <ellipse className="globe__sheen" cx="24" cy="20" rx="15" ry="11" fill={`url(#${sheenId})`} />
      </g>

      <circle cx="32" cy="32" r="29" fill="none" stroke="#ffe6ab" strokeWidth="1.2" strokeOpacity="0.55" />
    </svg>
  );
}
