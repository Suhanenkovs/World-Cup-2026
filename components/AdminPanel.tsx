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
  tab: "participants" | "bonus";
}

export default function AdminPanel({ players, questions, prizeConfig, tab }: Props) {
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

  // Bonus question management
  const [bonusQs, setBonusQs] = useState<BonusQuestion[]>(questions);
  const [editingQ, setEditingQ] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<BonusQuestion & { optionsText: string }>>({});
  const [qStatus, setQStatus] = useState<Record<string, string>>({});
  const [showAddQ, setShowAddQ] = useState(false);
  const [newQ, setNewQ] = useState({ question: "", category: "", max_points: "10", answer_type: "text" as BonusQuestion["answer_type"], optionsText: "" });
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

  function startEditQ(q: BonusQuestion) {
    setEditingQ(q.id);
    setEditDraft({ ...q, optionsText: (q.options ?? []).join(", ") });
  }

  async function saveQ(id: string) {
    setQStatus((s) => ({ ...s, [id]: "Saving…" }));
    const options = (editDraft.optionsText ?? "").split(",").map((o) => o.trim()).filter(Boolean);
    const res = await fetch("/api/admin/bonus-questions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...editDraft, options }),
    });
    const json = await res.json();
    if (json.success) {
      setBonusQs((qs) => qs.map((q) => q.id === id ? json.question as BonusQuestion : q));
      setEditingQ(null);
      setQStatus((s) => ({ ...s, [id]: "Saved ✓" }));
    } else {
      setQStatus((s) => ({ ...s, [id]: `Error: ${json.error}` }));
    }
  }

  async function deleteQ(id: string, label: string) {
    if (!confirm(`Delete question "${label}"? This removes all answers too.`)) return;
    const res = await fetch("/api/admin/bonus-questions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const json = await res.json();
    if (json.success) setBonusQs((qs) => qs.filter((q) => q.id !== id));
    else alert(`Error: ${json.error}`);
  }

  async function addQ(e: React.FormEvent) {
    e.preventDefault();
    const options = newQ.optionsText.split(",").map((o) => o.trim()).filter(Boolean);
    const res = await fetch("/api/admin/bonus-questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newQ, options }),
    });
    const json = await res.json();
    if (json.success) {
      setBonusQs((qs) => [...qs, json.question]);
      setNewQ({ question: "", category: "", max_points: "10", answer_type: "text", optionsText: "" });
      setShowAddQ(false);
    } else {
      alert(`Error: ${json.error}`);
    }
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
      {tab === "participants" && <>
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
          <div className="flex flex-col sm:flex-row gap-2">
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
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors sm:shrink-0"
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
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <span className="font-medium text-white">
                    {(p as any).name || p.username}
                  </span>
                  <div className="text-xs text-gray-500">{(p as any).email || p.username}</div>
                </div>
                <div className="flex items-center flex-wrap gap-2">
                  {(payStatus[p.id] || adminStatus[p.id]) && (
                    <span className="text-xs text-gray-400 w-full sm:w-auto">{adminStatus[p.id] || payStatus[p.id]}</span>
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

      {/* Manual sync */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-lg font-semibold text-white mb-2">Score Sync</h2>
        <p className="text-sm text-gray-400 mb-3">
          Automatically runs every 5 minutes via cron-job.org during match windows. Trigger manually here if needed.
        </p>
        <button
          onClick={triggerSync}
          disabled={isPending}
          className="bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white text-sm px-4 py-2 rounded-lg transition-colors"
        >
          {isPending ? "Syncing…" : "Sync scores now"}
        </button>
      </div>
      </>}
      {tab === "bonus" && <>
      {/* Bonus Questions management */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Bonus Questions</h2>
          <button
            onClick={() => setShowAddQ((v) => !v)}
            className="text-sm bg-amber-700 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            {showAddQ ? "Cancel" : "+ Add question"}
          </button>
        </div>

        {/* Add new question form */}
        {showAddQ && (
          <form onSubmit={addQ} className="mb-6 p-4 bg-gray-800 rounded-lg flex flex-col gap-3">
            <QField label="Question">
              <input required value={newQ.question} onChange={(e) => setNewQ((q) => ({ ...q, question: e.target.value }))}
                placeholder="e.g. Who will win the tournament?" className={inputCls} />
            </QField>
            <div className="grid grid-cols-2 gap-3">
              <QField label="Category">
                <input required value={newQ.category} onChange={(e) => setNewQ((q) => ({ ...q, category: e.target.value }))}
                  placeholder="e.g. Tournament" className={inputCls} />
              </QField>
              <QField label="Points">
                <input required type="text" inputMode="numeric" value={newQ.max_points}
                  onChange={(e) => setNewQ((q) => ({ ...q, max_points: e.target.value.replace(/\D/g, "") }))}
                  className={inputCls} />
              </QField>
            </div>
            <QField label="Answer type">
              <AnswerTypeSelect value={newQ.answer_type} onChange={(v) => setNewQ((q) => ({ ...q, answer_type: v }))} />
            </QField>
            {newQ.answer_type === "select" && (
              <QField label="Options (comma-separated)">
                <input value={newQ.optionsText} onChange={(e) => setNewQ((q) => ({ ...q, optionsText: e.target.value }))}
                  placeholder="e.g. Argentina, Brazil, France" className={inputCls} />
              </QField>
            )}
            <button type="submit" className="self-start bg-amber-700 hover:bg-amber-600 text-white text-sm px-4 py-2 rounded-lg transition-colors">
              Add question
            </button>
          </form>
        )}

        {/* Existing questions */}
        <div className="flex flex-col gap-3">
          {bonusQs.map((q) => (
            <div key={q.id} className="border border-gray-700 rounded-lg p-3">
              {editingQ === q.id ? (
                <div className="flex flex-col gap-2">
                  <QField label="Question">
                    <input value={editDraft.question ?? ""} onChange={(e) => setEditDraft((d) => ({ ...d, question: e.target.value }))} className={inputCls} />
                  </QField>
                  <div className="grid grid-cols-3 gap-2">
                    <QField label="Category">
                      <input value={editDraft.category ?? ""} onChange={(e) => setEditDraft((d) => ({ ...d, category: e.target.value }))} className={inputCls} />
                    </QField>
                    <QField label="Points">
                      <input type="text" inputMode="numeric" value={String(editDraft.max_points ?? "")}
                        onChange={(e) => setEditDraft((d) => ({ ...d, max_points: parseInt(e.target.value) || 0 }))} className={inputCls} />
                    </QField>
                    <QField label="Order">
                      <input type="text" inputMode="numeric" value={String(editDraft.sort_order ?? 0)}
                        onChange={(e) => setEditDraft((d) => ({ ...d, sort_order: parseInt(e.target.value) || 0 }))} className={inputCls} />
                    </QField>
                  </div>
                  <QField label="Answer type">
                    <AnswerTypeSelect value={(editDraft.answer_type ?? "text") as BonusQuestion["answer_type"]}
                      onChange={(v) => setEditDraft((d) => ({ ...d, answer_type: v }))} />
                  </QField>
                  {(editDraft.answer_type === "select") && (
                    <QField label="Options (comma-separated)">
                      <input value={editDraft.optionsText ?? ""} onChange={(e) => setEditDraft((d) => ({ ...d, optionsText: e.target.value }))}
                        placeholder="Option A, Option B, Option C" className={inputCls} />
                    </QField>
                  )}
                  <div className="flex gap-2 mt-1">
                    <button onClick={() => saveQ(q.id)} className="text-xs bg-emerald-700 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg transition-colors">Save</button>
                    <button onClick={() => setEditingQ(null)} className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg transition-colors">Cancel</button>
                    {qStatus[q.id] && <span className="text-xs text-gray-400 self-center">{qStatus[q.id]}</span>}
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] text-gray-600 font-mono">#{q.sort_order}</span>
                      <span className="text-[10px] text-amber-400 font-semibold uppercase">{q.category}</span>
                      <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">{q.answer_type}</span>
                      <span className="text-[10px] text-gray-500">{q.max_points} pts</span>
                      {q.resolved_at && <span className="text-[10px] text-emerald-400">✓ {q.correct_answer}</span>}
                    </div>
                    <p className="text-sm text-white mt-0.5">{q.question}</p>
                    {q.options && <p className="text-[10px] text-gray-500 mt-0.5">{q.options.join(" · ")}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => startEditQ(q)} className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-700 transition-colors">Edit</button>
                    <button onClick={() => deleteQ(q.id, q.question.slice(0, 40))} className="text-xs text-gray-600 hover:text-red-400 px-2 py-1 rounded hover:bg-gray-700 transition-colors">Delete</button>
                  </div>
                </div>
              )}

              {/* Resolve row (only for unresolved) */}
              {!q.resolved_at && (
                <div className="mt-2 pt-2 border-t border-gray-700/50 flex gap-2 items-center">
                  {q.answer_type === "yesno" ? (
                    <div className="relative flex-1 max-w-[160px]">
                      <select value={bonusAnswers[q.id] ?? ""} onChange={(e) => setBonusAnswers((a) => ({ ...a, [q.id]: e.target.value }))} className={selectCls}>
                        <option value="">Resolve…</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                      </select>
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">▼</span>
                    </div>
                  ) : q.answer_type === "select" && q.options?.length ? (
                    <div className="relative flex-1 max-w-[220px]">
                      <select value={bonusAnswers[q.id] ?? ""} onChange={(e) => setBonusAnswers((a) => ({ ...a, [q.id]: e.target.value }))} className={selectCls}>
                        <option value="">Resolve…</option>
                        {q.options.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">▼</span>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1 flex-1 max-w-[220px]">
                      <input value={bonusAnswers[q.id] ?? ""} onChange={(e) => setBonusAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                        placeholder="Correct answer…" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-amber-500" />
                      <span className="text-[10px] text-gray-600">Multiple valid answers? Use <span className="font-mono text-gray-500">Team A|Team B</span></span>
                    </div>
                  )}
                  <button onClick={() => resolveBonus(q.id)} className="text-xs bg-amber-700 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg transition-colors shrink-0">
                    Resolve
                  </button>
                  {bonusStatus[q.id] && <span className="text-xs text-gray-400">{bonusStatus[q.id]}</span>}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Auto-resolve */}
        <div className="mt-5 pt-5 border-t border-gray-800">
          <p className="text-xs text-gray-500 mb-2">Auto-resolve from football-data.org (tournament winner, finalists, top scorer, group goals). Multi-answer questions are handled automatically — both finalists and tied teams are accepted.</p>
          <button onClick={autoResolve} disabled={isPending}
            className="bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white text-sm px-4 py-2 rounded-lg transition-colors">
            {isPending ? "Resolving…" : "Auto-resolve All"}
          </button>
          {autoResolveStatus && <p className="text-sm text-gray-400 mt-2">{autoResolveStatus}</p>}
        </div>
      </div>

      </>}
    </div>
  );
}

const inputCls = "w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-amber-500";

function QField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] text-gray-400 mb-1 uppercase tracking-wide">{label}</div>
      {children}
    </div>
  );
}

const ANSWER_TYPES: { value: BonusQuestion["answer_type"]; label: string }[] = [
  { value: "text",   label: "Free text" },
  { value: "number", label: "Number" },
  { value: "team",   label: "Team (all WC teams)" },
  { value: "player", label: "Player search" },
  { value: "yesno",  label: "Yes / No" },
  { value: "select", label: "Custom dropdown" },
];

function AnswerTypeSelect({ value, onChange }: { value: BonusQuestion["answer_type"]; onChange: (v: BonusQuestion["answer_type"]) => void }) {
  return (
    <div className="relative">
      <select value={value} onChange={(e) => onChange(e.target.value as BonusQuestion["answer_type"])}
        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-amber-500 appearance-none cursor-pointer">
        {ANSWER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">▼</span>
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
