import Link from "next/link";

interface Tab {
  key: string;
  label: string;
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
    <div className="flex gap-1 bg-gray-900/50 border border-white/10 rounded-xl p-1 mb-6">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={`${basePath}?tab=${tab.key}`}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
            activeTab === tab.key
              ? "bg-emerald-600 text-white"
              : "text-gray-400 hover:text-white"
          }`}
        >
          {tab.label}
          {tab.live && (
            <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none animate-pulse">
              LIVE
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}
