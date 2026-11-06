"use client";

import React, { useState, useEffect } from "react";
import { formatIDR } from "@/lib/utils";
import { Plus, CheckCircle2, AlertCircle } from "lucide-react";

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

  // Modals
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [showPolicyModal, setShowPolicyModal] = useState(false);

  // Forms
  const [newShift, setNewShift] = useState({
    name: "",
    startTime: "08:00",
    endTime: "17:00",
    isOvernight: false,
    gracePeriodMinutes: 10,
    applicableDays: "1,2,3,4,5",
    deductionPolicyId: "",
  });

  const [newPolicy, setNewPolicy] = useState({
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
      if (polRes.policies?.length > 0 && !newShift.deductionPolicyId) {
        setNewShift((prev) => ({ ...prev, deductionPolicyId: polRes.policies[0].id }));
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

  const handleCreateShift = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/owner/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newShift),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setMessage({ text: "Work shift schedule created successfully.", type: "success" });
      setShowShiftModal(false);
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    }
  };

  const handleCreatePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/owner/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newPolicy),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setMessage({ text: "Deduction policy created successfully.", type: "success" });
      setShowPolicyModal(false);
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
          <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
            Shifts & Deduction Policies
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Configure daytime, evening, and overnight shift hours alongside lateness deduction rates.
          </p>
        </div>

        <div className="flex gap-2">
          <button onClick={() => setShowPolicyModal(true)} className="hig-button-secondary text-xs">
            <Plus className="w-3.5 h-3.5 stroke-[2]" />
            New Policy
          </button>
          <button onClick={() => setShowShiftModal(true)} className="hig-button-primary text-xs">
            <Plus className="w-3.5 h-3.5 stroke-[2]" />
            New Shift
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
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-3">
          Configured Work Shifts
        </h2>
        <div className="grid md:grid-cols-3 gap-4">
          {shifts.map((s) => (
            <div key={s.id} className="hig-card p-4 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-sm text-[var(--text-primary)]">{s.name}</h3>
                  <div className="text-xs font-mono tabular-numbers text-[var(--text-secondary)] mt-0.5">
                    {s.startTime} - {s.endTime}
                  </div>
                </div>
                {s.isOvernight && (
                  <span className="hig-badge hig-badge-neutral text-[10px] font-semibold">
                    Overnight (Next Day)
                  </span>
                )}
              </div>

              <div className="text-xs space-y-1.5 pt-2 border-t border-[var(--separator-subtle)] text-[var(--text-secondary)]">
                <div className="flex justify-between">
                  <span>Grace Period:</span>
                  <span className="font-medium text-[var(--text-primary)] tabular-numbers">{s.gracePeriodMinutes} mins</span>
                </div>
                <div className="flex justify-between">
                  <span>Deduction:</span>
                  <span className="font-medium text-[var(--system-red)]">{s.deductionPolicy.name}</span>
                </div>
                <div className="flex justify-between">
                  <span>Assigned Staff:</span>
                  <span className="font-semibold text-[var(--text-primary)] tabular-numbers">{s._count.employees} employees</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Deduction Policies Table */}
      <div className="hig-card overflow-hidden">
        <div className="p-4 border-b border-[var(--separator)]">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            Deduction Policies
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="hig-table">
            <thead>
              <tr>
                <th>Policy Title</th>
                <th>Mode</th>
                <th>Rate</th>
                <th>Hourly Rounding</th>
                <th>Grace Window</th>
                <th>Max Limit</th>
              </tr>
            </thead>
            <tbody className="tabular-numbers">
              {policies.map((p) => (
                <tr key={p.id}>
                  <td className="font-medium text-[var(--text-primary)]">{p.name}</td>
                  <td>
                    <span className="hig-badge hig-badge-neutral font-mono text-[10px]">
                      {p.mode}
                    </span>
                  </td>
                  <td className="font-semibold text-[var(--system-red)]">{formatIDR(p.rate)}</td>
                  <td>{p.mode === "PER_HOUR" ? p.hourlyRounding : "Exact"}</td>
                  <td>{p.gracePeriodMinutes} mins</td>
                  <td>{p.maxDeductionPercent}% daily wage</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: NEW SHIFT */}
      {showShiftModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="hig-card-elevated max-w-md w-full p-6">
            <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">New Work Shift Schedule</h2>
            <form onSubmit={handleCreateShift} className="space-y-3 mt-4">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Shift Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Night Shift (22:00 - 06:00)"
                  value={newShift.name}
                  onChange={(e) => setNewShift({ ...newShift, name: e.target.value })}
                  className="hig-input"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Start Time (HH:mm)</label>
                  <input
                    type="time"
                    required
                    value={newShift.startTime}
                    onChange={(e) => setNewShift({ ...newShift, startTime: e.target.value })}
                    className="hig-input font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">End Time (HH:mm)</label>
                  <input
                    type="time"
                    required
                    value={newShift.endTime}
                    onChange={(e) => setNewShift({ ...newShift, endTime: e.target.value })}
                    className="hig-input font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 py-1">
                <input
                  type="checkbox"
                  id="overnightCheck"
                  checked={newShift.isOvernight}
                  onChange={(e) => setNewShift({ ...newShift, isOvernight: e.target.checked })}
                  className="rounded border-[var(--separator)]"
                />
                <label htmlFor="overnightCheck" className="text-xs font-medium cursor-pointer">
                  Overnight Shift (Crosses midnight to next calendar date)
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Grace Period (Mins)</label>
                  <input
                    type="number"
                    min="0"
                    value={newShift.gracePeriodMinutes}
                    onChange={(e) => setNewShift({ ...newShift, gracePeriodMinutes: parseInt(e.target.value) || 0 })}
                    className="hig-input tabular-numbers"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Deduction Policy</label>
                  <select
                    value={newShift.deductionPolicyId}
                    onChange={(e) => setNewShift({ ...newShift, deductionPolicyId: e.target.value })}
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
                <button type="button" onClick={() => setShowShiftModal(false)} className="hig-button-secondary text-xs">
                  Cancel
                </button>
                <button type="submit" className="hig-button-primary text-xs">
                  Save Shift
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: NEW POLICY */}
      {showPolicyModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="hig-card-elevated max-w-md w-full p-6">
            <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">New Deduction Policy</h2>
            <form onSubmit={handleCreatePolicy} className="space-y-3 mt-4">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Policy Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Per-Minute Rp500"
                  value={newPolicy.name}
                  onChange={(e) => setNewPolicy({ ...newPolicy, name: e.target.value })}
                  className="hig-input"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Mode</label>
                  <select
                    value={newPolicy.mode}
                    onChange={(e) => setNewPolicy({ ...newPolicy, mode: e.target.value as any })}
                    className="hig-input"
                  >
                    <option value="PER_MINUTE">Mode A — Per Minute</option>
                    <option value="PER_HOUR">Mode B — Per Hour</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Rate (IDR)
                  </label>
                  <input
                    type="number"
                    step="100"
                    required
                    value={newPolicy.rate}
                    onChange={(e) => setNewPolicy({ ...newPolicy, rate: parseInt(e.target.value) || 0 })}
                    className="hig-input tabular-numbers font-medium"
                  />
                </div>
              </div>

              {newPolicy.mode === "PER_HOUR" && (
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Hourly Rounding Rule</label>
                  <select
                    value={newPolicy.hourlyRounding}
                    onChange={(e) => setNewPolicy({ ...newPolicy, hourlyRounding: e.target.value as any })}
                    className="hig-input"
                  >
                    <option value="EXACT">Exact Proportional Calculation</option>
                    <option value="ROUND_UP">Round Up to Next Full Hour</option>
                    <option value="ROUND_DOWN">Round Down to Full Hours</option>
                    <option value="ROUND_NEAREST">Round to Nearest Full Hour</option>
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Grace Period (Mins)</label>
                  <input
                    type="number"
                    value={newPolicy.gracePeriodMinutes}
                    onChange={(e) => setNewPolicy({ ...newPolicy, gracePeriodMinutes: parseInt(e.target.value) || 0 })}
                    className="hig-input tabular-numbers"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Max Cap (% Daily Pay)</label>
                  <input
                    type="number"
                    max="100"
                    min="10"
                    value={newPolicy.maxDeductionPercent}
                    onChange={(e) => setNewPolicy({ ...newPolicy, maxDeductionPercent: parseInt(e.target.value) || 100 })}
                    className="hig-input tabular-numbers"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[var(--separator-subtle)]">
                <button type="button" onClick={() => setShowPolicyModal(false)} className="hig-button-secondary text-xs">
                  Cancel
                </button>
                <button type="submit" className="hig-button-primary text-xs">
                  Save Policy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
