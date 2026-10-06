import barangaySeal from "../assets/barangay-old-lucban-seal.png";

export default function BarangayBrand({
  subtitle = "Resident Information & Service Portal",
  light = false,
  compact = false,
  homeHref = "#/",
  onHome,
}: {
  subtitle?: string;
  light?: boolean;
  compact?: boolean;
  homeHref?: string;
  onHome?: () => void;
}) {
  return (
    <a
      href={homeHref}
      onClick={onHome}
      aria-label="Barangay Old Lucban — Home"
      title="Go to Home"
      className="group flex min-h-11 min-w-0 items-center gap-3 rounded-lg text-left"
    >
      <img
        src={barangaySeal}
        alt="Barangay Happy Homes–Old Lucban seal"
        width={48}
        height={48}
        className={`${compact ? "h-10 w-10" : "h-12 w-12"} shrink-0 rounded-full object-contain object-center`}
      />
      <div className="min-w-0">
        <p
          className={`text-sm font-bold leading-5 underline-offset-4 group-hover:underline sm:text-base ${light ? "text-white" : "text-pine-900"}`}
        >
          Barangay Old Lucban
        </p>
        <p
          className={`mt-1 text-xs leading-4 ${light ? "text-pine-200" : "text-slate-500"}`}
        >
          {subtitle}
        </p>
      </div>
    </a>
  );
}
