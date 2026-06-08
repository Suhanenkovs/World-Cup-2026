"use client";

import { useState, useTransition } from "react";
import type { Profile, BonusQuestion } from "@/types/database";

interface PrizeConfig {
  id: number;
  entry_fee: number;
  winner_pct: number;
  second_pct: number;
  third_pct: number;
  fourth_pct: number;
  fifth_pct: number;
}

const PLACE_LABELS = ["1st", "2nd", "3rd", "4th", "5th"];

function configToPlaces(cfg: PrizeConfig): { pct: number }[] {
  const raw = [cfg.winner_pct, cfg.second_pct, cfg.third_pct, cfg.fourth_pct ?? 0, cfg.fifth_pct ?? 0];
  const places = raw.map((pct) => ({ pct })).filter((p, i) => i === 0 || p.pct > 0);
  return places.length ? places : [{ pct: 0 }];
}

const selectCls = `flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm
  focus:outline-none focus:border-amber-500 appearance-none cursor-pointer`;

interface Props {
  players: Profile[];
  questions: BonusQuestion[];
  prizeConfig: PrizeConfig;
}

export default function AdminPanel({ players, questions, prizeConfig }: Props) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteStatus, setInviteStatus] = useState("");
  const [payStatus, setPayStatus] = useState<Record<string, string>>({});
  const [adminStatus, setAdminStatus] = useState<Record<string, string>>({});
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [names, setNames] = useState<Record<string, string>>(
    Object.fromEntries(players.map((p) => [p.id, (p as any).name ?? ""]))
  );
  const [nameStatus, setNameStatus] = useState<Record<string, string>>({});
  const [bonusAnswers, setBonusAnswers] = useState<Record<string, string>>({});
  const [bonusStatus, setBonusStatus] = useState<Record<string, string>>({});
  const [autoResolveStatus, setAutoResolveStatus] = useState("");
  const [isPending, startTransition] = useTransition();

  // Prize config editing state
  const [entryFee, setEntryFee] = useState(String(prizeConfig.entry_fee));
  const [places, setPlaces] = useState<{ pct: string }[]>(
    configToPlaces(prizeConfig).map((p) => ({ pct: String(p.pct) }))
  );
  const [prizeStatus, setPrizeStatus] = useState("");

  const paidCount = players.filter((p) => p.paid).length;
  const fee = parseFloat(entryFee) || 0;
  const pot = paidCount * fee;
  const totalPct = places.map((p) => parseFloat(p.pct) || 0).reduce((s, n) => s + n, 0);
  const pctOk = Math.round(totalPct) === 100;

  function updatePlace(i: number, val: string) {
    setPlaces((prev) => prev.map((p, idx) => idx === i ? { pct: val } : p));
  }
  function addPlace() {
    if (places.length < 5) setPlaces((prev) => [...prev, { pct: "0" }]);
  }
  function removePlace(i: number) {
    if (places.length > 1) setPlaces((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function savePrizeConfig() {
    if (!pctOk) { setPrizeStatus("Percentages must sum to 100."); return; }
    setPrizeStatus("Saving…");
    const res = await fetch("/api/admin/prize-config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_fee: parseFloat(entryFee),
        places: places.map((p) => ({ pct: parseFloat(p.pct) || 0 })),
      }),
    });
    const json = await res.json();
    setPrizeStatus(json.success ? "Saved ✓" : `Error: ${json.error}`);
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteStatus("Sending…");
    const res = await fetch("/api/admin/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail, name: inviteName }),
    });
    const json = await res.json();
    if (json.success) {
      setInviteStatus(`Invite sent to ${inviteEmail}`);
      setInviteEmail("");
      setInviteName("");
    } else {
      setInviteStatus(`Error: ${json.error}`);
    }
  }

  async function saveName(userId: string) {
    setNameStatus((s) => ({ ...s, [userId]: "Saving…" }));
    const res = await fetch("/api/admin/set-name", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, name: names[userId] }),
    });
    const json = await res.json();
    setNameStatus((s) => ({
      ...s,
      [userId]: json.success ? "Saved ✓" : `Error: ${json.error}`,
    }));
  }

  async function deleteUser(userId: string, displayName: string) {
    if (!confirm(`Delete ${displayName}? This removes all their predictions and cannot be undone.`)) return;
    const res = await fetch("/api/admin/delete-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const json = await res.json();
    if (json.success) {
      setDeletedIds((s) => new Set(s).add(userId));
    } else {
      alert(`Error: ${json.error}`);
    }
  }

  async function toggleAdmin(userId: string, currentIsAdmin: boolean) {
    setAdminStatus((s) => ({ ...s, [userId]: "Saving…" }));
    const res = await fetch("/api/admin/set-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, isAdmin: !currentIsAdmin }),
    });
    const json = await res.json();
    setAdminStatus((s) => ({
      ...s,
      [userId]: json.success ? (!currentIsAdmin ? "Made admin ✓" : "Removed admin") : `Error: ${json.error}`,
    }));
  }

  async function togglePaid(userId: string, currentPaid: boolean) {
    setPayStatus((s) => ({ ...s, [userId]: "Saving…" }));
    const res = await fetch("/api/admin/mark-paid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, paid: !currentPaid }),
    });
    const json = await res.json();
    setPayStatus((s) => ({
      ...s,
      [userId]: json.success ? (!currentPaid ? "Marked paid ✓" : "Marked unpaid") : `Error: ${json.error}`,
    }));
  }

  async function resolveBonus(questionId: string) {
    const answer = bonusAnswers[questionId]?.trim();
    if (!answer) return;
    setBonusStatus((s) => ({ ...s, [questionId]: "Resolving…" }));
    const res = await fetch("/api/admin/resolve-bonus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId, correctAnswer: answer }),
    });
    const json = await res.json();
    setBonusStatus((s) => ({
      ...s,
      [questionId]: json.success ? `Done — scored ${json.resolved} answers` : `Error: ${json.error}`,
    }));
  }

  async function autoResolve() {
    setAutoResolveStatus("Fetching from football-data.org…");
    startTransition(async () => {
      const res = await fetch("/api/admin/auto-resolve", { method: "POST" });
      const json = await res.json();
      if (!json.success) { setAutoResolveStatus(`Error: ${json.error}`); return; }
      const resolved = json.results.filter((r: { answer: string | null }) => r.answer !== null);
      const skipped  = json.results.filter((r: { answer: string | null }) => r.answer === null);
      setAutoResolveStatus(
        `Done — ${resolved.length} resolved, ${skipped.length} need manual input.`
      );
    });
  }

  async function triggerSync() {
    startTransition(async () => {
      const res = await fetch("/api/cron/sync-scores", {
        headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET ?? ""}` },
      });
      const json = await res.json();
      alert(`Sync complete: ${json.synced} matches updated, ${json.scored} predictions scored`);
    });
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Prize pool config */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-lg font-semibold text-white mb-4">Prize Pool</h2>

        {/* Summary row */}
        <div className="grid grid-cols-3 gap-3 text-center mb-6">
          <Stat label="Paid players" value={`${paidCount} / ${players.length}`} />
          <Stat label="Total pot" value={`€${pot.toFixed(2)}`} accent="text-yellow-400" />
          <Stat label="% allocated" value={`${totalPct.toFixed(1)}%`} accent={pctOk ? "text-emerald-400" : "text-red-400"} />
        </div>

        {/* Entry fee */}
        <div className="mb-4">
          <label className="text-xs text-gray-400 block mb-1">Entry fee (€)</label>
          <input
            type="text" inputMode="decimal"
            value={entryFee}
            onChange={(e) => setEntryFee(e.target.value.replace(/[^0-9.]/g, ""))}
            className="w-32 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-amber-500"
          />
        </div>

        {/* Prize places */}
        <div className="mb-4">
          <div className="text-xs text-gray-400 mb-2">Prize places</div>
          <div className="flex flex-col gap-2">
            {places.map((p, i) => {
              const prize = Math.round(pot * (parseFloat(p.pct) || 0) / 100);
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-6 shrink-0">{PLACE_LABELS[i]}</span>
                  <input
                    type="text" inputMode="decimal"
                    value={p.pct}
                    onChange={(e) => updatePlace(i, e.target.value.replace(/[^0-9.]/g, ""))}
                    className="w-20 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-amber-500"
                  />
                  <span className="text-xs text-gray-500">%</span>
                  <span className="text-xs text-yellow-400 font-medium w-16">€{prize}</span>
                  {places.length > 1 && (
                    <button onClick={() => removePlace(i)} className="text-gray-600 hover:text-red-400 text-sm transition-colors">✕</button>
                  )}
                </div>
              );
            })}
          </div>
          {places.length < 5 && (
            <button onClick={addPlace} className="mt-2 text-xs text-gray-500 hover:text-gray-300 transition-colors">
              + Add place
            </button>
          )}
        </div>

        {!pctOk && (
          <p className="text-xs text-red-400 mb-3">
            Total is {totalPct.toFixed(1)}% — must equal exactly 100%.
          </p>
        )}

        <button
          onClick={savePrizeConfig}
          disabled={!pctOk}
          className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          Save prize config
        </button>
        {prizeStatus && <span className="ml-3 text-sm text-gray-400">{prizeStatus}</span>}
      </div>

      {/* Invite player */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-lg font-semibold text-white mb-3">Invite Player</h2>
        <form onSubmit={sendInvite} className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              type="text"
              required
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              placeholder="Full name"
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
            />
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="email@example.com"
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shrink-0"
            >
              Send invite
            </button>
          </div>
        </form>
        {inviteStatus && <p className="text-sm text-gray-400 mt-2">{inviteStatus}</p>}
      </div>

      {/* Players & payment */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-lg font-semibold text-white mb-3">Players</h2>
        <div className="flex flex-col gap-2">
          {players.filter((p) => !deletedIds.has(p.id)).map((p) => (
            <div key={p.id} className="flex flex-col gap-2 py-3 border-b border-gray-800 last:border-0">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <span className="font-medium text-white">
                    {(p as any).name || p.username}
                  </span>
                  <div className="text-xs text-gray-500">{(p as any).email || p.username}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {(payStatus[p.id] || adminStatus[p.id]) && (
                    <span className="text-xs text-gray-400">{adminStatus[p.id] || payStatus[p.id]}</span>
                  )}
                  <button
                    onClick={() => toggleAdmin(p.id, p.is_admin)}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                      p.is_admin
                        ? "bg-amber-900/40 text-amber-400 hover:bg-red-900/40 hover:text-red-400"
                        : "bg-gray-800 text-gray-500 hover:bg-amber-900/40 hover:text-amber-400"
                    }`}
                  >
                    {p.is_admin ? "Admin ✓" : "Make admin"}
                  </button>
                  <button
                    onClick={() => togglePaid(p.id, p.paid)}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                      p.paid
                        ? "bg-emerald-900/40 text-emerald-400 hover:bg-red-900/40 hover:text-red-400"
                        : "bg-gray-800 text-gray-400 hover:bg-emerald-900/40 hover:text-emerald-400"
                    }`}
                  >
                    {p.paid ? "Paid ✓" : "Mark paid"}
                  </button>
                  <button
                    onClick={() => deleteUser(p.id, (p as any).name || p.username)}
                    className="text-xs px-3 py-1.5 rounded-lg font-medium text-gray-600 hover:bg-red-900/40 hover:text-red-400 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  placeholder="Real name…"
                  value={names[p.id] ?? ""}
                  onChange={(e) => setNames((n) => ({ ...n, [p.id]: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && saveName(p.id)}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-emerald-500"
                />
                <button
                  onClick={() => saveName(p.id)}
                  className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg transition-colors shrink-0"
                >
                  Save name
                </button>
                {nameStatus[p.id] && <span className="text-xs text-gray-400">{nameStatus[p.id]}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bonus question resolution */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-lg font-semibold text-white mb-1">Bonus Questions</h2>
        <p className="text-sm text-gray-400 mb-4">
          Fetches results from football-data.org and scores all answers automatically.
        </p>
        <button
          onClick={autoResolve}
          disabled={isPending}
          className="bg-amber-700 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          {isPending ? "Resolving…" : "Auto-resolve All"}
        </button>
        {autoResolveStatus && <p className="text-sm text-gray-400 mt-2">{autoResolveStatus}</p>}

        {/* Status of each question */}
        <div className="mt-4 flex flex-col gap-2">
          {questions.map((q) => (
            <div key={q.id} className="flex items-start justify-between gap-3 py-2 border-b border-gray-800 last:border-0">
              <p className="text-sm text-gray-300">{q.question}</p>
              {q.resolved_at ? (
                <span className="shrink-0 text-xs text-emerald-400 font-medium">{q.correct_answer}</span>
              ) : (
                <span className="shrink-0 text-xs text-gray-600">Pending</span>
              )}
            </div>
          ))}
        </div>

        {/* Manual fallback for questions that can't be auto-resolved */}
        {questions.some((q) => !q.resolved_at && q.question.toLowerCase().includes("red card")) && (
          <div className="mt-4 pt-4 border-t border-gray-800">
            <p className="text-xs text-gray-500 mb-3">Manual resolve (not available from API):</p>
            {questions.filter((q) => !q.resolved_at && q.question.toLowerCase().includes("red card")).map((q) => (
              <div key={q.id}>
                <p className="text-sm text-white mb-2">{q.question}</p>
                <div className="flex gap-2 items-center">
                  <div className="relative flex-1">
                    <select
                      value={bonusAnswers[q.id] ?? ""}
                      onChange={(e) => setBonusAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                      className={selectCls}
                    >
                      <option value="">Select…</option>
                      <option value="Yes">Yes</option>
                      <option value="No">No</option>
                    </select>
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">▼</span>
                  </div>
                  <button
                    onClick={() => resolveBonus(q.id)}
                    className="bg-amber-700 hover:bg-amber-600 text-white text-xs px-3 py-1.5 rounded-lg transition-colors shrink-0"
                  >
                    Resolve
                  </button>
                </div>
                {bonusStatus[q.id] && <p className="text-xs text-gray-400 mt-1">{bonusStatus[q.id]}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Manual sync */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-lg font-semibold text-white mb-2">Score Sync</h2>
        <p className="text-sm text-gray-400 mb-3">
          Automatically runs every 5 minutes via Vercel Cron during match windows. Trigger manually here if needed.
        </p>
        <button
          onClick={triggerSync}
          disabled={isPending}
          className="bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white text-sm px-4 py-2 rounded-lg transition-colors"
        >
          {isPending ? "Syncing…" : "Sync scores now"}
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, accent = "text-white" }: { label: string; value: string; accent?: string }) {
  return (
    <div className="bg-gray-800/50 rounded-lg px-3 py-2">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-lg font-bold ${accent}`}>{value}</div>
    </div>
  );
}
