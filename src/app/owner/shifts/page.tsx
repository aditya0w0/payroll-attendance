"use client";

import React, { useState, useEffect } from "react";
import { formatIDR } from "@/lib/utils";
import { Plus, CheckCircle2, AlertCircle, Pencil, Trash2 } from "lucide-react";

interface PolicyItem {
  id: string;
  name: string;
  mode: string;
  rate: number;
  hourlyRounding: string;
  gracePeriodMinutes: number;
  maxDeductionPercent: number;
}

interface ShiftItem {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  isOvernight: boolean;
  gracePeriodMinutes: number;
  applicableDays: string;
  deductionPolicy: PolicyItem;
  _count: { employees: number };
}

export default function OwnerShiftsPage() {
  const [shifts, setShifts] = useState<ShiftItem[]>([]);
  const [policies, setPolicies] = useState<PolicyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Modals & Edit States
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);

  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);

  // Forms
  const [shiftForm, setShiftForm] = useState({
    name: "",
    startTime: "08:00",
    endTime: "17:00",
    isOvernight: false,
    gracePeriodMinutes: 10,
    applicableDays: "1,2,3,4,5",
    deductionPolicyId: "",
  });

  const [policyForm, setPolicyForm] = useState({
    name: "",
    mode: "PER_MINUTE" as "PER_MINUTE" | "PER_HOUR",
    rate: 500,
    hourlyRounding: "EXACT" as "EXACT" | "ROUND_UP" | "ROUND_DOWN" | "ROUND_NEAREST",
    gracePeriodMinutes: 10,
    maxDeductionPercent: 100,
  });

  const loadData = async () => {
    try {
      const [shiftRes, polRes] = await Promise.all([
        fetch("/api/owner/shifts").then((r) => r.json()),
        fetch("/api/owner/policies").then((r) => r.json()),
      ]);
      setShifts(shiftRes.shifts || []);
      setPolicies(polRes.policies || []);
      if (polRes.policies?.length > 0 && !shiftForm.deductionPolicyId) {
        setShiftForm((prev) => ({ ...prev, deductionPolicyId: polRes.policies[0].id }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Modal keyboard Escape listener (R-32)
  useEffect(() => {
    if (!showShiftModal && !showPolicyModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowShiftModal(false);
        setEditingShiftId(null);
        setShowPolicyModal(false);
        setEditingPolicyId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showShiftModal, showPolicyModal]);

  // Open Shift Modals
  const openNewShiftModal = () => {
    setEditingShiftId(null);
    setShiftForm({
      name: "",
      startTime: "08:00",
      endTime: "17:00",
      isOvernight: false,
      gracePeriodMinutes: 10,
      applicableDays: "1,2,3,4,5",
      deductionPolicyId: policies[0]?.id || "",
    });
    setShowShiftModal(true);
  };

  const openEditShiftModal = (s: ShiftItem) => {
    setEditingShiftId(s.id);
    setShiftForm({
      name: s.name,
      startTime: s.startTime,
      endTime: s.endTime,
      isOvernight: s.isOvernight,
      gracePeriodMinutes: s.gracePeriodMinutes,
      applicableDays: s.applicableDays,
      deductionPolicyId: s.deductionPolicy?.id || policies[0]?.id || "",
    });
    setShowShiftModal(true);
  };

  // Open Policy Modals
  const openNewPolicyModal = () => {
    setEditingPolicyId(null);
    setPolicyForm({
      name: "",
      mode: "PER_MINUTE",
      rate: 500,
      hourlyRounding: "EXACT",
      gracePeriodMinutes: 10,
      maxDeductionPercent: 100,
    });
    setShowPolicyModal(true);
  };

  const openEditPolicyModal = (p: PolicyItem) => {
    setEditingPolicyId(p.id);
    setPolicyForm({
      name: p.name,
      mode: p.mode as "PER_MINUTE" | "PER_HOUR",
      rate: p.rate,
      hourlyRounding: (p.hourlyRounding as any) || "EXACT",
      gracePeriodMinutes: p.gracePeriodMinutes,
      maxDeductionPercent: p.maxDeductionPercent,
    });
    setShowPolicyModal(true);
  };

  // Submit Shift
  const handleSubmitShift = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = "/api/owner/shifts";
      const method = editingShiftId ? "PUT" : "POST";
      const payload = editingShiftId ? { id: editingShiftId, ...shiftForm } : shiftForm;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setMessage({
        text: editingShiftId ? "Jadwal shift berhasil diperbarui." : "Jadwal shift kerja berhasil ditambahkan.",
        type: "success",
      });
      setShowShiftModal(false);
      setEditingShiftId(null);
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    }
  };

  // Delete Shift
  const handleDeleteShift = async (id: string, name: string, staffCount: number) => {
    if (staffCount > 0) {
      setMessage({
        text: `Shift "${name}" masih memiliki ${staffCount} staf aktif dan tidak dapat dihapus.`,
        type: "error",
      });
      return;
    }

    if (!window.confirm(`Hapus jadwal shift "${name}"?`)) return;

    try {
      const res = await fetch(`/api/owner/shifts?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setMessage({ text: `Shift "${name}" berhasil dihapus.`, type: "success" });
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    }
  };

  // Submit Policy
  const handleSubmitPolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = "/api/owner/policies";
      const method = editingPolicyId ? "PUT" : "POST";
      const payload = editingPolicyId ? { id: editingPolicyId, ...policyForm } : policyForm;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setMessage({
        text: editingPolicyId ? "Kebijakan denda berhasil diperbarui." : "Kebijakan denda keterlambatan berhasil disimpan.",
        type: "success",
      });
      setShowPolicyModal(false);
      setEditingPolicyId(null);
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    }
  };

  // Delete Policy
  const handleDeletePolicy = async (id: string, name: string) => {
    if (!window.confirm(`Hapus kebijakan denda "${name}"?`)) return;

    try {
      const res = await fetch(`/api/owner/policies?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setMessage({ text: `Kebijakan "${name}" berhasil dihapus.`, type: "success" });
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    }
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
              Shift Kerja &amp; Kebijakan Denda
            </h1>
            <span className="hig-badge hig-badge-neutral text-xs font-semibold px-2.5 py-0.5">
              {shifts.length} shift • {policies.length} kebijakan
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={openNewPolicyModal} className="hig-button-secondary text-xs">
            <Plus className="w-3.5 h-3.5 stroke-[2]" />
            Buat Kebijakan Denda
          </button>
          <button onClick={openNewShiftModal} className="hig-button-primary text-xs">
            <Plus className="w-3.5 h-3.5 stroke-[2]" />
            Tambah Shift Baru
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
            message.type === "success"
              ? "bg-[var(--system-green-tint)] text-[var(--system-green)]"
              : "bg-[var(--system-red-tint)] text-[var(--system-red)]"
          }`}
        >
          {message.type === "success" ? <CheckCircle2 className="w-4 h-4 stroke-[2]" /> : <AlertCircle className="w-4 h-4 stroke-[2]" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Shifts Grid */}
      <div>
        <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
          Daftar Shift Kerja
        </h2>
        <div className="grid md:grid-cols-3 gap-4">
          {shifts.map((s) => {
            const cleanShiftName = s.name.replace(/\s*\(\d{2}:\d{2}\s*-\s*\d{2}:\d{2}\)/, "");
            const rateUnit = s.deductionPolicy?.mode === "PER_MINUTE" ? "/menit" : "/jam";

            return (
              <div key={s.id} className="hig-card p-4 flex flex-col justify-between gap-3">
                <div className="space-y-2.5">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <h3 className="font-semibold text-sm text-[var(--text-primary)]">{cleanShiftName}</h3>
                      <div className="text-xs font-mono tabular-numbers text-[var(--text-secondary)] mt-0.5">
                        {s.startTime} – {s.endTime} WIB
                      </div>
                    </div>
                    {s.isOvernight && (
                      <span className="hig-badge hig-badge-neutral text-[10px] font-semibold shrink-0">
                        Lintas Hari
                      </span>
                    )}
                  </div>

                  {/* Sleek inline chips without verbose stacked text */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 tabular-numbers">
                      Toleransi {s.gracePeriodMinutes}m
                    </span>
                    {s.deductionPolicy && (
                      <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md bg-red-500/10 text-red-600 dark:text-red-400 tabular-numbers">
                        {formatIDR(s.deductionPolicy.rate)}{rateUnit}
                      </span>
                    )}
                    <span className="inline-flex items-center text-[11px] text-neutral-500 dark:text-neutral-400 px-1.5 py-0.5 tabular-numbers">
                      {s._count.employees} staf aktif
                    </span>
                  </div>
                </div>

                {/* Card actions (R-26) */}
                <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-[var(--separator-subtle)]">
                  <button
                    onClick={() => openEditShiftModal(s)}
                    className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2 py-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors flex items-center gap-1"
                  >
                    <Pencil className="w-3 h-3" />
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteShift(s.id, cleanShiftName, s._count.employees)}
                    disabled={s._count.employees > 0}
                    className={`text-xs px-2 py-1 rounded transition-colors flex items-center gap-1 ${
                      s._count.employees > 0
                        ? "text-neutral-300 dark:text-neutral-600 cursor-not-allowed"
                        : "text-neutral-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                    }`}
                    title={s._count.employees > 0 ? "Shift masih memiliki staf aktif" : "Hapus shift"}
                  >
                    <Trash2 className="w-3 h-3" />
                    Hapus
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Deduction Policies Table */}
      <div className="hig-card overflow-hidden">
        <div className="p-4 border-b border-[var(--separator)]">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            Kebijakan Pemotongan Denda
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="hig-table">
            <thead>
              <tr>
                <th>Nama Kebijakan</th>
                <th>Skema Hitung</th>
                <th>Tarif Denda</th>
                <th>Pembulatan Jam</th>
                <th>Toleransi</th>
                <th>Batas Maksimal</th>
                <th className="text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="tabular-numbers">
              {policies.map((p) => {
                const modeLabel = p.mode === "PER_MINUTE" ? "Per Menit" : "Per Jam";
                const roundingLabel =
                  p.mode !== "PER_HOUR"
                    ? "–"
                    : p.hourlyRounding === "ROUND_UP"
                    ? "Bulatkan ke Atas"
                    : p.hourlyRounding === "ROUND_DOWN"
                    ? "Bulatkan ke Bawah"
                    : p.hourlyRounding === "ROUND_NEAREST"
                    ? "Jam Terdekat"
                    : "Proporsional Riil";

                return (
                  <tr key={p.id}>
                    <td className="font-medium text-[var(--text-primary)]">{p.name}</td>
                    <td>
                      <span className="hig-badge hig-badge-neutral text-[10px]">
                        {modeLabel}
                      </span>
                    </td>
                    <td className="font-semibold text-[var(--system-red)]">{formatIDR(p.rate)}</td>
                    <td className="text-neutral-500">{roundingLabel}</td>
                    <td>{p.gracePeriodMinutes} menit</td>
                    <td>Maks. {p.maxDeductionPercent}%</td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEditPolicyModal(p)}
                          className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2 py-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeletePolicy(p.id, p.name)}
                          className="text-xs text-neutral-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                        >
                          Hapus
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: ADD / EDIT SHIFT */}
      {showShiftModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="hig-card-elevated max-w-md w-full p-6">
            <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
              {editingShiftId ? "Edit Shift Kerja" : "Tambah Shift Kerja"}
            </h2>
            <form onSubmit={handleSubmitShift} className="space-y-3 mt-4">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Nama Shift</label>
                <input
                  type="text"
                  required
                  placeholder="Shift Pagi"
                  value={shiftForm.name}
                  onChange={(e) => setShiftForm({ ...shiftForm, name: e.target.value })}
                  className="hig-input"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Jam Mulai</label>
                  <input
                    type="time"
                    required
                    value={shiftForm.startTime}
                    onChange={(e) => setShiftForm({ ...shiftForm, startTime: e.target.value })}
                    className="hig-input font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Jam Selesai</label>
                  <input
                    type="time"
                    required
                    value={shiftForm.endTime}
                    onChange={(e) => setShiftForm({ ...shiftForm, endTime: e.target.value })}
                    className="hig-input font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 py-1">
                <input
                  type="checkbox"
                  id="overnightCheck"
                  checked={shiftForm.isOvernight}
                  onChange={(e) => setShiftForm({ ...shiftForm, isOvernight: e.target.checked })}
                  className="rounded border-[var(--separator)]"
                />
                <label htmlFor="overnightCheck" className="text-xs font-medium cursor-pointer">
                  Shift Lintas Hari (Overnight)
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Toleransi (Menit)</label>
                  <input
                    type="number"
                    min="0"
                    value={shiftForm.gracePeriodMinutes}
                    onChange={(e) => setShiftForm({ ...shiftForm, gracePeriodMinutes: parseInt(e.target.value) || 0 })}
                    className="hig-input tabular-numbers"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Kebijakan Denda</label>
                  <select
                    value={shiftForm.deductionPolicyId}
                    onChange={(e) => setShiftForm({ ...shiftForm, deductionPolicyId: e.target.value })}
                    className="hig-input"
                  >
                    {policies.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[var(--separator-subtle)]">
                <button
                  type="button"
                  onClick={() => {
                    setShowShiftModal(false);
                    setEditingShiftId(null);
                  }}
                  className="hig-button-secondary text-xs"
                >
                  Batal
                </button>
                <button type="submit" className="hig-button-primary text-xs">
                  {editingShiftId ? "Perbarui Shift" : "Simpan Shift"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD / EDIT POLICY */}
      {showPolicyModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="hig-card-elevated max-w-md w-full p-6">
            <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
              {editingPolicyId ? "Edit Kebijakan Denda" : "Buat Kebijakan Denda"}
            </h2>
            <form onSubmit={handleSubmitPolicy} className="space-y-3 mt-4">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Nama Kebijakan</label>
                <input
                  type="text"
                  required
                  placeholder="Standar Per Menit"
                  value={policyForm.name}
                  onChange={(e) => setPolicyForm({ ...policyForm, name: e.target.value })}
                  className="hig-input"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Skema Hitung</label>
                  <select
                    value={policyForm.mode}
                    onChange={(e) => setPolicyForm({ ...policyForm, mode: e.target.value as any })}
                    className="hig-input"
                  >
                    <option value="PER_MINUTE">Per Menit</option>
                    <option value="PER_HOUR">Per Jam</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Tarif Denda (IDR)
                  </label>
                  <input
                    type="number"
                    step="100"
                    required
                    value={policyForm.rate}
                    onChange={(e) => setPolicyForm({ ...policyForm, rate: parseInt(e.target.value) || 0 })}
                    className="hig-input tabular-numbers font-medium"
                  />
                </div>
              </div>

              {policyForm.mode === "PER_HOUR" && (
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Pembulatan Jam</label>
                  <select
                    value={policyForm.hourlyRounding}
                    onChange={(e) => setPolicyForm({ ...policyForm, hourlyRounding: e.target.value as any })}
                    className="hig-input"
                  >
                    <option value="EXACT">Proporsional Riil</option>
                    <option value="ROUND_UP">Bulatkan ke Atas</option>
                    <option value="ROUND_DOWN">Bulatkan ke Bawah</option>
                    <option value="ROUND_NEAREST">Jam Terdekat</option>
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Toleransi (Menit)</label>
                  <input
                    type="number"
                    value={policyForm.gracePeriodMinutes}
                    onChange={(e) => setPolicyForm({ ...policyForm, gracePeriodMinutes: parseInt(e.target.value) || 0 })}
                    className="hig-input tabular-numbers"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Batas Maksimal (% Gaji Harian)</label>
                  <input
                    type="number"
                    max="100"
                    min="10"
                    value={policyForm.maxDeductionPercent}
                    onChange={(e) => setPolicyForm({ ...policyForm, maxDeductionPercent: parseInt(e.target.value) || 100 })}
                    className="hig-input tabular-numbers"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[var(--separator-subtle)]">
                <button
                  type="button"
                  onClick={() => {
                    setShowPolicyModal(false);
                    setEditingPolicyId(null);
                  }}
                  className="hig-button-secondary text-xs"
                >
                  Batal
                </button>
                <button type="submit" className="hig-button-primary text-xs">
                  {editingPolicyId ? "Perbarui Kebijakan" : "Simpan Kebijakan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}