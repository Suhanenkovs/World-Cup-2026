"use client";

import { useRouter } from "next/navigation";

export function BackButton({ label = "← Back" }: { label?: string }) {
  const router = useRouter();
  return (
    <button
      onClick={() => router.back()}
      className="text-xs text-gray-500 hover:text-gray-300 transition-colors mb-6 inline-block"
    >
      {label}
    </button>
  );
}
