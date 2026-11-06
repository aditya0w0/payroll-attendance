"use client";

import React, { useState, useEffect } from "react";
import { formatIDR } from "@/lib/utils";
import { Plus, Smartphone, DollarSign, RotateCcw, AlertCircle, CheckCircle2 } from "lucide-react";

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
      if (!res.ok) throw new Error(data.error || "Failed to create employee");

      setMessage({ text: data.message || "Employee created successfully.", type: "success" });
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
          salaryChangeReason: editSalaryReason || "Owner wage revision",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update salary");

      setMessage({ text: data.message, type: "success" });
      setEditingEmployee(null);
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    }
  };

  const handleResetDevice = async (userId: string, name: string) => {
    if (!confirm(`Reset device registration for ${name}? The employee will be able to bind a new device on next login.`)) {
      return;
    }

    try {
      const res = await fetch("/api/owner/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "RESET_DEVICE",
          userId,
          reason: "Owner manual reset",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

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
            Employee Directory & Daily Salaries
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Configure employee profiles, assign daily salaries, and manage single-device authorizations.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="hig-button-primary text-xs"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2]" />
          Add Employee
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
          <div className="text-center py-12 text-xs text-[var(--text-tertiary)]">Loading workforce directory...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="hig-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Daily Salary</th>
                  <th>Work Shift</th>
                  <th>Status</th>
                  <th>Authorized Device</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="tabular-numbers">
                {employees.map((emp) => {
                  const dev = emp.user.deviceRegistration;
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
                        <div className="text-[10px] text-[var(--text-secondary)]">base daily rate</div>
                      </td>

                      <td>
                        <div className="font-medium text-[var(--text-primary)]">{emp.shift.name}</div>
                        <div className="text-[11px] text-[var(--text-secondary)] font-mono">
                          {emp.shift.startTime} - {emp.shift.endTime} {emp.shift.isOvernight && "(Overnight)"}
                        </div>
                      </td>

                      <td>
                        <span className="hig-badge hig-badge-neutral text-[10px]">
                          {emp.employmentStatus}
                        </span>
                      </td>

                      <td>
                        {dev ? (
                          <div className="flex items-center gap-1.5 text-[var(--system-green)]">
                            <Smartphone className="w-3.5 h-3.5 stroke-[1.75]" />
                            <span className="font-medium">{dev.deviceName}</span>
                          </div>
                        ) : (
                          <span className="text-[var(--system-orange)] font-medium">
                            Unbound (First login binds)
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
                            <DollarSign className="w-3 h-3 stroke-[2]" />
                            Set Salary
                          </button>

                          {dev && (
                            <button
                              onClick={() => handleResetDevice(emp.user.id, emp.fullName)}
                              className="hig-button-destructive text-[11px] py-1 px-2"
                              title="Reset device binding"
                            >
                              <RotateCcw className="w-3 h-3 stroke-[2]" />
                              Reset
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
              Add Employee
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mb-4">
              Enter employee credentials, base daily wage, and assigned shift schedule.
            </p>

            <form onSubmit={handleCreateEmployee} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={newEmp.fullName}
                  onChange={(e) => setNewEmp({ ...newEmp, fullName: e.target.value })}
                  placeholder="Employee full name"
                  className="hig-input"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Employee ID</label>
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
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Username</label>
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
                    placeholder="email@company.com"
                    className="hig-input"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Password</label>
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
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Daily Salary (IDR)</label>
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
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Work Shift</label>
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
                  Cancel
                </button>
                <button
                  type="submit"
                  className="hig-button-primary text-xs"
                >
                  Create
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
              Adjust Daily Salary
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mb-4">
              Historical values and effective dates are preserved in the employee salary ledger.
            </p>

            <form onSubmit={handleUpdateSalary} className="space-y-3">
              <div className="bg-[var(--separator-subtle)] p-2.5 rounded-lg text-xs">
                <div className="text-[var(--text-secondary)]">Employee:</div>
                <div className="font-semibold text-[var(--text-primary)]">
                  {editingEmployee.fullName} ({editingEmployee.employeeId})
                </div>
                <div className="text-[11px] text-[var(--text-secondary)] mt-0.5 tabular-numbers">
                  Current: {formatIDR(editingEmployee.dailySalary)} / day
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  New Daily Salary (IDR)
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
                  {formatIDR(editSalaryVal)} per completed day
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  Reason for Adjustment
                </label>
                <input
                  type="text"
                  required
                  value={editSalaryReason}
                  onChange={(e) => setEditSalaryReason(e.target.value)}
                  placeholder="e.g. Annual compensation revision"
                  className="hig-input"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[var(--separator-subtle)]">
                <button
                  type="button"
                  onClick={() => setEditingEmployee(null)}
                  className="hig-button-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="hig-button-primary text-xs"
                >
                  Save Salary
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
