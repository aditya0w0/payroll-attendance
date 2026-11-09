"use client";

import React, { useState, useEffect } from "react";
import {
  MapPin,
  Wifi,
  WifiOff,
  Crosshair,
  CheckCircle2,
  AlertCircle,
  Save,
  RefreshCw,
  Sliders,
  ShieldCheck,
  Globe,
} from "lucide-react";

interface OfficeConfigData {
  id: string;
  officeName: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  officePublicIp: string | null;
  enforceWifiIp: boolean;
  enforceGeofence: boolean;
  maxGpsAccuracy: number;
}

export default function OwnerSettingsPage() {
  const [config, setConfig] = useState<OfficeConfigData>({
    id: "",
    officeName: "Kantor Utama",
    latitude: -6.2088,
    longitude: 106.8456,
    radiusMeters: 50,
    officePublicIp: "",
    enforceWifiIp: false,
    enforceGeofence: true,
    maxGpsAccuracy: 80,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [detectingIp, setDetectingIp] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/owner/office-config");
      const data = await res.json();
      if (data.config) {
        setConfig({
          ...data.config,
          officePublicIp: data.config.officePublicIp || "",
        });
      }
    } catch (e: any) {
      setMessage({ text: e.message || "Failed to load office settings", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const handleGetCurrentLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setMessage({
        text: "Browser tidak mendukung sensor GPS Geolocation.",
        type: "error",
      });
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setConfig((prev) => ({
          ...prev,
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6)),
        }));
        setMessage({
          text: `Koordinat GPS berhasil diambil (${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}) dengan akurasi +/- ${Math.round(pos.coords.accuracy)}m.`,
          type: "success",
        });
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setMessage({
          text: `Gagal membaca GPS: ${err.message}. Pastikan izin lokasi aktif pada browser.`,
          type: "error",
        });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleGetMyIp = async () => {
    try {
      setDetectingIp(true);
      const res = await fetch("/api/owner/my-ip");
      const data = await res.json();
      if (data.ip) {
        setConfig((prev) => ({ ...prev, officePublicIp: data.ip }));
        setMessage({
          text: `IP Publik WiFi terdeteksi: ${data.ip}`,
          type: "success",
        });
      }
    } catch (e: any) {
      setMessage({ text: "Gagal mendeteksi IP publik WiFi kantor.", type: "error" });
    } finally {
      setDetectingIp(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/owner/office-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal menyimpan konfigurasi kantor");
      }

      setMessage({ text: data.message, type: "success" });
      if (data.config) {
        setConfig({
          ...data.config,
          officePublicIp: data.config.officePublicIp || "",
        });
      }
    } catch (err: any) {
      setMessage({ text: err.message || "Gagal menyimpan pengaturan", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
              Office Location &amp; WiFi Verification
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              Anti-Cheat Geofence
            </span>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Configure physical office GPS coordinates and public WiFi IP to block forwarded QR photo attendance (&quot;jastip absen&quot;).
          </p>
        </div>

        <button
          type="button"
          onClick={loadConfig}
          disabled={loading}
          className="bg-neutral-100 dark:bg-[#2C2C2E] text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-200 dark:hover:bg-[#3A3A3C] rounded-lg px-3 py-2 text-xs font-medium inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </button>
      </div>

      {message && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-start gap-2.5 ${
            message.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/80"
              : "bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800/80"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Main Form */}
      <form onSubmit={handleSave} className="space-y-6">
        {/* Section 1: Office GPS Geofence */}
        <div className="bg-white dark:bg-[#1C1C1E] border border-neutral-200 dark:border-neutral-800 rounded-xl p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-neutral-800">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <h2 className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                1. GPS Geofence Radius
              </h2>
            </div>
            {config.enforceGeofence ? (
              <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                [GEOFENCE ENFORCED]
              </span>
            ) : (
              <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-800/50 text-neutral-500 dark:text-neutral-400">
                [DISABLED]
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 md:col-span-2">
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Nama Kantor / Toko
              </label>
              <input
                type="text"
                value={config.officeName}
                onChange={(e) => setConfig({ ...config, officeName: e.target.value })}
                required
                placeholder="Kantor Utama / Toko Cabang"
                className="w-full bg-neutral-50 dark:bg-[#2C2C2E] text-neutral-900 dark:text-neutral-100 border border-neutral-300 dark:border-neutral-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Latitude (Garis Lintang)
              </label>
              <input
                type="number"
                step="0.000001"
                value={config.latitude}
                onChange={(e) => setConfig({ ...config, latitude: parseFloat(e.target.value) || 0 })}
                required
                className="w-full font-mono bg-neutral-50 dark:bg-[#2C2C2E] text-neutral-900 dark:text-neutral-100 border border-neutral-300 dark:border-neutral-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Longitude (Garis Bujur)
              </label>
              <input
                type="number"
                step="0.000001"
                value={config.longitude}
                onChange={(e) => setConfig({ ...config, longitude: parseFloat(e.target.value) || 0 })}
                required
                className="w-full font-mono bg-neutral-50 dark:bg-[#2C2C2E] text-neutral-900 dark:text-neutral-100 border border-neutral-300 dark:border-neutral-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
              />
            </div>
          </div>

          {/* Location Capture Button */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleGetCurrentLocation}
              disabled={locating}
              className="bg-neutral-100 dark:bg-[#2C2C2E] text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-200 dark:hover:bg-[#3A3A3C] rounded-lg px-3 py-2 text-xs font-medium inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <Crosshair className={`w-3.5 h-3.5 ${locating ? "animate-spin" : ""}`} />
              <span>{locating ? "Mengambil Koordinat GPS..." : "Gunakan Lokasi Saya Saat Ini"}</span>
            </button>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              Ambil titik presisi GPS dari browser perangkat Anda saat berada di kantor.
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-neutral-200 dark:border-neutral-800">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Radius Toleransi Geofence (Meter)
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="10"
                  max="1000"
                  value={config.radiusMeters}
                  onChange={(e) => setConfig({ ...config, radiusMeters: parseInt(e.target.value) || 50 })}
                  className="w-28 font-mono bg-neutral-50 dark:bg-[#2C2C2E] text-neutral-900 dark:text-neutral-100 border border-neutral-300 dark:border-neutral-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
                />
                <div className="flex gap-1.5">
                  {[20, 50, 100].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setConfig({ ...config, radiusMeters: preset })}
                      className={`px-3 py-1.5 text-xs rounded-lg border font-mono transition-colors ${
                        config.radiusMeters === preset
                          ? "bg-blue-600 text-white font-medium border-transparent"
                          : "bg-neutral-100 dark:bg-[#2C2C2E] text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-200 dark:hover:bg-[#3A3A3C]"
                      }`}
                    >
                      {preset}m
                    </button>
                  ))}
                </div>
              </div>
              <span className="text-xs text-neutral-500 dark:text-neutral-400 block">
                Radius maksimum karyawan dapat melakukan absensi dari titik koordinat kantor.
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Maksimal Akurasi GPS Diterima (Meter)
              </label>
              <input
                type="number"
                min="10"
                max="500"
                value={config.maxGpsAccuracy}
                onChange={(e) => setConfig({ ...config, maxGpsAccuracy: parseInt(e.target.value) || 80 })}
                className="w-28 font-mono bg-neutral-50 dark:bg-[#2C2C2E] text-neutral-900 dark:text-neutral-100 border border-neutral-300 dark:border-neutral-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
              />
              <span className="text-xs text-neutral-500 dark:text-neutral-400 block">
                Tolak sinyal GPS dengan akurasi buruk (&gt; {config.maxGpsAccuracy}m) untuk mencegah cell-tower spoofing.
              </span>
            </div>
          </div>

          {/* Toggle: Enforce Geofence */}
          <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200 block">
                Wajibkan Radius GPS (Geofence)
              </span>
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                Karyawan di luar radius {config.radiusMeters}m akan otomatis ditolak dengan kode GEO_OUT_OF_BOUNDS.
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config.enforceGeofence}
                onChange={(e) => setConfig({ ...config, enforceGeofence: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-neutral-300 dark:bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>

        {/* Section 2: Office WiFi WAN IP Verification */}
        <div className="bg-white dark:bg-[#1C1C1E] border border-neutral-200 dark:border-neutral-800 rounded-xl p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-neutral-800">
            <div className="flex items-center gap-2">
              <Wifi className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <h2 className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                2. Office WiFi Public IP Matching
              </h2>
            </div>
            {config.enforceWifiIp ? (
              <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                [WIFI ENFORCED]
              </span>
            ) : (
              <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-800/50 text-neutral-500 dark:text-neutral-400">
                [OPTIONAL]
              </span>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              IP Publik WiFi Kantor (WAN IP)
            </label>
            <div className="flex flex-col sm:flex-row gap-2 max-w-xl">
              <input
                type="text"
                value={config.officePublicIp || ""}
                onChange={(e) => setConfig({ ...config, officePublicIp: e.target.value })}
                placeholder="Misal: 180.252.12.34 / 203.0.113.195"
                className="flex-1 max-w-md font-mono bg-neutral-50 dark:bg-[#2C2C2E] text-neutral-900 dark:text-neutral-100 border border-neutral-300 dark:border-neutral-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
              />
              <button
                type="button"
                onClick={handleGetMyIp}
                disabled={detectingIp}
                className="bg-neutral-100 dark:bg-[#2C2C2E] text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-200 dark:hover:bg-[#3A3A3C] rounded-lg px-3 py-2 text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap transition-colors disabled:opacity-50"
              >
                <Globe className={`w-3.5 h-3.5 ${detectingIp ? "animate-spin" : ""}`} />
                <span>{detectingIp ? "Mendeteksi..." : "Gunakan IP Saya Saat Ini"}</span>
              </button>
            </div>
            <span className="text-xs text-neutral-500 dark:text-neutral-400 block">
              IP publik router WiFi kantor (Biznet, IndiHome, CBN, MyRepublic). Buka halaman ini menggunakan WiFi kantor dan klik tombol deteksi.
            </span>
          </div>

          {/* Toggle: Enforce WiFi IP */}
          <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200 block">
                Wajibkan Terhubung ke WiFi Kantor
              </span>
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                Presensi hanya diizinkan jika perangkat karyawan tersambung ke WiFi kantor (mencegah absen via data seluler dari luar).
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config.enforceWifiIp}
                onChange={(e) => setConfig({ ...config, enforceWifiIp: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-neutral-300 dark:bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-xs font-medium flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? "Menyimpan..." : "Simpan Konfigurasi"}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
