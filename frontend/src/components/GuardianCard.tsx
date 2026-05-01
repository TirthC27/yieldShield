interface Props {
  level: number;
  size?: number;
}

const LEVEL_NAMES = ["", "Iron", "Sapphire", "Amethyst", "Gold", "Prismatic"];

export default function GuardianCard({ level, size = 80 }: Props) {
  const cls = `shield shield-${Math.min(level, 5)}`;

  return (
    <div className="glass p-6 flex flex-col items-center gap-4 hover:border-accent-orange/30 transition-all">
      <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Your Guardian</h3>
      <div className={cls} style={{ fontSize: size }}>
        <svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5zm0 2.18l7 3.89v4.27c0 4.54-3.06 8.77-7 9.95-3.94-1.18-7-5.41-7-9.95V8.07l7-3.89z" />
          <path d="M12 6.5L7 9.5v3c0 3.17 2.14 6.13 5 6.95 2.86-.82 5-3.78 5-6.95v-3L12 6.5z" opacity="0.5" />
        </svg>
      </div>
      <div className="text-center">
        <p className="font-bold text-lg">{LEVEL_NAMES[level] || "Unknown"} Guardian</p>
        <p className="text-sm text-accent-orange">Level {level}</p>
      </div>
      <div className="w-full bg-navy-800 rounded-full h-2 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent-orange to-accent-amber transition-all duration-700"
          style={{ width: `${(level / 5) * 100}%` }}
        />
      </div>
      <p className="text-xs text-slate-500">
        {level < 5 ? `${3 - (level % 3)} more deposits to next level` : "Max level reached! 🎉"}
      </p>
    </div>
  );
}
