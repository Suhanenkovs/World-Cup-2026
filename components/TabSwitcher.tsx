import Link from "next/link";

interface Tab {
  key: string;
  label: string;
  count?: number;
  live?: boolean;
}

export default function TabSwitcher({
  tabs,
  activeTab,
  basePath,
}: {
  tabs: Tab[];
  activeTab: string;
  basePath: string;
}) {
  return (
    <div className="flex border-b border-white/10 mb-8">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <Link
            key={tab.key}
            href={`${basePath}?tab=${tab.key}`}
            className={`-mb-px mr-8 flex items-center gap-2 border-b-2 pb-3 text-sm font-semibold transition-colors
              ${isActive
                ? "border-emerald-400 text-white"
                : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className={`rounded px-1.5 py-0.5 font-mono text-[11px] leading-none
                ${isActive
                  ? "bg-emerald-950/80 text-emerald-400"
                  : "bg-white/5 text-gray-600"
                }`}>
                {tab.count}
              </span>
            )}
            {tab.live && (
              <span className="animate-pulse rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-bold leading-none text-white">
                LIVE
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
