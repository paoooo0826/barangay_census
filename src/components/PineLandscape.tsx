export default function PineLandscape({
  className = "",
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 640 260"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path
        d="M0 197 108 83 176 157 270 50 378 162 486 99 640 203V260H0Z"
        fill="currentColor"
        opacity="0.08"
      />
      <path
        d="m0 227 139-82 109 52 138-75 111 70 143-47v115H0Z"
        fill="currentColor"
        opacity="0.12"
      />
      {[48, 100, 151, 447, 506, 555, 600].map((x, index) => (
        <g
          key={x}
          transform={`translate(${x} ${index % 2 ? 152 : 173}) scale(${index % 2 ? 1.05 : 0.8})`}
          fill="currentColor"
          opacity="0.24"
        >
          <path d="M0 0-17 32h10l-18 29h16L-30 94h60L9 61h16L7 32h10Z" />
          <rect x="-3" y="85" width="6" height="28" />
        </g>
      ))}
    </svg>
  );
}
