"use client";

import React, { useState, useEffect } from "react";
import { formatIDR } from "@/lib/utils";
import { Plus, Smartphone, Banknote, RotateCcw, AlertCircle, CheckCircle2 } from "lucide-react";

interface ShiftItem {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  isOvernight: boolean;
}

interface EmployeeItem {
  id: string;
  fullName: string;
  employeeId: string;
  dailySalary: number;
  employmentStatus: string;
  shift: ShiftItem;
  user: {
    id: string;
    email: string;
    username: string;
    status: string;
    deviceRegistration: {
      deviceName: string;
      platform: string;
    } | null;
  };
  salaryHistory: Array<{
    id: string;
    previousSalary: number;
    newSalary: number;
    effectiveDate: string;
    reason: string;
  }>;
}

export default function OwnerEmployeesPage() {
  const [employees, setEmployees] = useState<EmployeeItem[]>([]);
  const [shifts, setShifts] = useState<ShiftItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<EmployeeItem | null>(null);

  // Form states
  const [newEmp, setNewEmp] = useState({
    fullName: "",
    employeeId: "",
    username: "",
    email: "",
    initialPassword: "employee123",
    dailySalary: 150000,
    shiftId: "",
    employmentStatus: "PERMANENT",
  });

  const [editSalaryVal, setEditSalaryVal] = useState<number>(0);
  const [editSalaryReason, setEditSalaryReason] = useState("");

  const loadData = async () => {
    try {
      const [empRes, shiftRes] = await Promise.all([
        fetch("/api/owner/employees").then((r) => r.json()),
        fetch("/api/owner/shifts").then((r) => r.json()),
      ]);
      setEmployees(empRes.employees || []);
      setShifts(shiftRes.shifts || []);
      if (shiftRes.shifts?.length > 0 && !newEmp.shiftId) {
        setNewEmp((prev) => ({ ...prev, shiftId: shiftRes.shifts[0].id }));
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
    if (!showAddModal && !editingEmployee) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowAddModal(false);
        setEditingEmployee(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showAddModal, editingEmployee]);

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    try {
      const res = await fetch("/api/owner/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newEmp),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal membuat karyawan baru");

      setMessage({ text: data.message || "Karyawan baru berhasil ditambahkan.", type: "success" });
      setShowAddModal(false);
      setNewEmp({
        fullName: "",
        employeeId: "",
        username: "",
        email: "",
        initialPassword: "employee123",
        dailySalary: 150000,
        shiftId: shifts[0]?.id || "",
        employmentStatus: "PERMANENT",
      });
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    }
  };

  const handleUpdateSalary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;

    try {
      const res = await fetch(`/api/owner/employees/${editingEmployee.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dailySalary: editSalaryVal,
          salaryChangeReason: editSalaryReason || "Penyesuaian tarif oleh owner",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memperbarui gaji");

      setMessage({ text: data.message, type: "success" });
      setEditingEmployee(null);
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    }
  };

  const handleResetDevice = async (userId: string, name: string) => {
    if (!confirm(`Reset pendaftaran perangkat untuk ${name}? Karyawan dapat mendaftarkan perangkat baru saat login berikutnya.`)) {
      return;
    }

    try {
      const res = await fetch("/api/owner/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "RESET_DEVICE",
          userId,
          reason: "Reset manual oleh owner",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mereset perangkat");

      setMessage({ text: data.message, type: "success" });
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
            Daftar Karyawan & Gaji Harian
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Kelola profil karyawan, tarif upah harian, jadwal shift kerja, dan status binding perangkat.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="hig-button-primary text-xs"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2]" />
          Tambah Karyawan
        </button>
      </div>

      {message && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
            message.type === "success"
              ? "bg-[var(--system-green-tint)] text-[var(--system-green)]"
              : "bg-[var(--system-red-tint)] text-[var(--system-red)]"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 stroke-[2]" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 stroke-[2]" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Employee Table */}
      <div className="hig-card overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-xs text-[var(--text-tertiary)]">Memuat data karyawan...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="hig-table">
              <thead>
                <tr>
                  <th>Karyawan</th>
                  <th>Gaji Pokok / Hari</th>
                  <th>Shift Kerja</th>
                  <th>Status Kerja</th>
                  <th>Perangkat Terdaftar</th>
                  <th className="text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="tabular-numbers">
                {employees.map((emp) => {
                  const dev = emp.user.deviceRegistration;
                  const statusLabel =
                    emp.employmentStatus === "PERMANENT"
                      ? "Tetap"
                      : emp.employmentStatus === "CONTRACT"
                      ? "Kontrak"
                      : emp.employmentStatus;

                  return (
                    <tr key={emp.id}>
                      <td>
                        <div className="font-medium text-[var(--text-primary)]">{emp.fullName}</div>
                        <div className="text-[11px] text-[var(--text-tertiary)] font-mono">
                          {emp.employeeId} • {emp.user.email}
                        </div>
                      </td>

                      <td>
                        <div className="font-semibold text-sm text-[var(--text-primary)]">
                          {formatIDR(emp.dailySalary)}
                        </div>
                      </td>

                      <td>
                        <div className="font-medium text-[var(--text-primary)]">{emp.shift.name}</div>
                        <div className="text-[11px] text-[var(--text-secondary)] font-mono">
                          {emp.shift.startTime} - {emp.shift.endTime} {emp.shift.isOvernight && "(Shift Malam)"}
                        </div>
                      </td>

                      <td>
                        <span className="hig-badge hig-badge-neutral text-[10px]">
                          {statusLabel}
                        </span>
                      </td>

                      <td>
                        {dev ? (
                          <div className="flex items-center gap-1.5 text-[var(--system-green)]">
                            <Smartphone className="w-3.5 h-3.5 stroke-[1.75]" />
                            <span className="font-medium">{dev.deviceName}</span>
                          </div>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400 font-medium text-xs">
                            Belum Terhubung
                          </span>
                        )}
                      </td>

                      <td className="text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              setEditingEmployee(emp);
                              setEditSalaryVal(emp.dailySalary);
                              setEditSalaryReason("");
                            }}
                            className="hig-button-secondary text-[11px] py-1 px-2.5"
                          >
                            <Banknote className="w-3.5 h-3.5 stroke-[1.75]" />
                            Atur Gaji
                          </button>

                          {dev && (
                            <button
                              onClick={() => handleResetDevice(emp.user.id, emp.fullName)}
                              className="hig-button-destructive text-[11px] py-1 px-2.5"
                              title="Reset pengikatan perangkat"
                            >
                              <RotateCcw className="w-3.5 h-3.5 stroke-[1.75]" />
                              Reset Perangkat
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL 1: ADD EMPLOYEE */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="hig-card-elevated max-w-md w-full p-6 animate-in fade-in zoom-in-95">
            <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
              Tambah Karyawan Baru
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mb-4">
              Masukkan data profil, upah harian dasar, dan shift kerja yang ditugaskan.
            </p>

            <form onSubmit={handleCreateEmployee} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Nama Lengkap</label>
                <input
                  type="text"
                  required
                  value={newEmp.fullName}
                  onChange={(e) => setNewEmp({ ...newEmp, fullName: e.target.value })}
                  placeholder="Nama lengkap karyawan"
                  className="hig-input"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">ID Karyawan</label>
                  <input
                    type="text"
                    required
                    value={newEmp.employeeId}
                    onChange={(e) => setNewEmp({ ...newEmp, employeeId: e.target.value })}
                    placeholder="EMP-004"
                    className="hig-input font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Nama Pengguna</label>
                  <input
                    type="text"
                    required
                    value={newEmp.username}
                    onChange={(e) => setNewEmp({ ...newEmp, username: e.target.value })}
                    placeholder="username"
                    className="hig-input"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Email</label>
                  <input
                    type="email"
                    required
                    value={newEmp.email}
                    onChange={(e) => setNewEmp({ ...newEmp, email: e.target.value })}
                    placeholder="email@perusahaan.com"
                    className="hig-input"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Kata Sandi Awal</label>
                  <input
                    type="text"
                    required
                    value={newEmp.initialPassword}
                    onChange={(e) => setNewEmp({ ...newEmp, initialPassword: e.target.value })}
                    className="hig-input font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Gaji Pokok Harian (IDR)</label>
                  <input
                    type="number"
                    step="1000"
                    required
                    value={newEmp.dailySalary}
                    onChange={(e) => setNewEmp({ ...newEmp, dailySalary: parseInt(e.target.value) || 0 })}
                    className="hig-input tabular-numbers font-medium"
                  />
                  <span className="text-[11px] text-[var(--text-secondary)] mt-0.5 block tabular-numbers">{formatIDR(newEmp.dailySalary)}</span>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Shift Kerja</label>
                  <select
                    value={newEmp.shiftId}
                    onChange={(e) => setNewEmp({ ...newEmp, shiftId: e.target.value })}
                    className="hig-input"
                  >
                    {shifts.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.startTime}-{s.endTime})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[var(--separator-subtle)]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="hig-button-secondary text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="hig-button-primary text-xs"
                >
                  Simpan Karyawan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: EDIT DAILY SALARY */}
      {editingEmployee && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="hig-card-elevated max-w-sm w-full p-6 animate-in fade-in zoom-in-95">
            <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
              Ubah Gaji Pokok Harian
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mb-4">
              Perubahan tarif harian akan tercatat dalam riwayat penyesuaian gaji karyawan.
            </p>

            <form onSubmit={handleUpdateSalary} className="space-y-3">
              <div className="bg-[var(--separator-subtle)] p-2.5 rounded-lg text-xs">
                <div className="text-[var(--text-secondary)]">Karyawan:</div>
                <div className="font-semibold text-[var(--text-primary)]">
                  {editingEmployee.fullName} ({editingEmployee.employeeId})
                </div>
                <div className="text-[11px] text-[var(--text-secondary)] mt-0.5 tabular-numbers">
                  Tarif Saat Ini: {formatIDR(editingEmployee.dailySalary)} / hari
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  Tarif Baru per Hari (IDR)
                </label>
                <input
                  type="number"
                  step="1000"
                  required
                  value={editSalaryVal}
                  onChange={(e) => setEditSalaryVal(parseInt(e.target.value) || 0)}
                  className="hig-input font-semibold tabular-numbers text-sm"
                />
                <span className="text-xs text-[var(--accent)] font-medium mt-1 block tabular-numbers">
                  {formatIDR(editSalaryVal)} per hari kerja
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  Alasan Penyesuaian Gaji
                </label>
                <input
                  type="text"
                  required
                  value={editSalaryReason}
                  onChange={(e) => setEditSalaryReason(e.target.value)}
                  placeholder="Misal: Penyesuaian tahunan atau kenaikan tingkat"
                  className="hig-input"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[var(--separator-subtle)]">
                <button
                  type="button"
                  onClick={() => setEditingEmployee(null)}
                  className="hig-button-secondary text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="hig-button-primary text-xs"
                >
                  Perbarui Gaji
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
