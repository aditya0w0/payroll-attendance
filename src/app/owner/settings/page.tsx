"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import {
  MapPin,
  Wifi,
  Crosshair,
  CheckCircle2,
  AlertCircle,
  Save,
  RefreshCw,
  Globe,
  Compass,
} from "lucide-react";
import { acquirePrecisionLocation, PrecisionLocationResult } from "@/lib/geo-browser";

// Dynamic import for Leaflet map to prevent SSR window reference error
const MapLocationPicker = dynamic(() => import("@/components/MapLocationPicker"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-80 rounded-xl bg-[var(--system-bg-secondary)] animate-pulse flex flex-col items-center justify-center gap-2 text-xs text-[var(--text-tertiary)]">
      <Compass className="w-6 h-6 animate-spin text-[var(--accent)]" />
      <span>Memuat Peta Interaktif &amp; Geofence...</span>
    </div>
  ),
});

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

const INDONESIA_CITY_PRESETS = [
  { name: "Pekalongan", lat: -6.8886, lon: 109.6753 },
  { name: "Buaran", lat: -6.9338, lon: 109.6541 },
  { name: "Semarang", lat: -6.9904, lon: 110.4229 },
  { name: "Jakarta", lat: -6.2088, lon: 106.8456 },
  { name: "Bandung", lat: -6.9175, lon: 107.6191 },
  { name: "Surabaya", lat: -7.2575, lon: 112.7521 },
  { name: "Yogyakarta", lat: -7.7956, lon: 110.3695 },
  { name: "Solo", lat: -7.5666, lon: 110.8292 },
  { name: "Medan", lat: 3.5952, lon: 98.6722 },
];

export default function OwnerSettingsPage() {
  const [config, setConfig] = useState<OfficeConfigData>({
    id: "",
    officeName: "Kantor Utama",
    latitude: -6.9338,
    longitude: 109.6541,
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
      setMessage({ text: e.message || "Gagal memuat pengaturan kantor", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  // Multi-Sample Precision GPS Acquisition
  const handleGetCurrentLocation = async () => {
    const isSecure =
      typeof window !== "undefined" &&
      (window.isSecureContext ||
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1");

    if (!isSecure) {
      setMessage({
        text: "Browser memblokir izin GPS karena aplikasi dibuka via HTTP biasa. Buka via HTTPS agar izin lokasi aktif.",
        type: "error",
      });
      return;
    }

    setLocating(true);
    setMessage(null);

    try {
      const res: PrecisionLocationResult = await acquirePrecisionLocation(
        (info) => {
          setMessage({
            text: info.message,
            type: "success",
          });
        },
        { targetAccuracyMeters: 20, maxAcquisitionMs: 15000, allowIpFallback: false }
      );

      if (res.error) {
        setMessage({
          text: res.error,
          type: "error",
        });
        return;
      }

      if (res.accuracy > 80) {
        setMessage({
          text: `Sinyal GPS belum akurat (+/- ${res.accuracy}m). Geser pin pada peta ke titik kantor Anda.`,
          type: "error",
        });
        return;
      }

      setConfig((prev) => ({
        ...prev,
        latitude: res.latitude,
        longitude: res.longitude,
      }));

      setMessage({
        text: `Koordinat GPS diperbarui (${res.latitude}, ${res.longitude}) dengan akurasi +/- ${res.accuracy}m.`,
        type: "success",
      });
    } catch (err: any) {
      setMessage({
        text: `Gagal membaca GPS: ${err.message}. Pastikan izin lokasi aktif pada browser.`,
        type: "error",
      });
    } finally {
      setLocating(false);
    }
  };

  const handleGetMyIp = async () => {
    try {
      setDetectingIp(true);
      const res = await fetch("/api/owner/my-ip");
      const data = await res.json();
      if (data.ip) {
        setConfig((prev) => ({ ...prev, officePublicIp: data.ip }));
        setMessage({
          text: `IP Publik WiFi kantor terdeteksi: ${data.ip}`,
          type: "success",
        });
      }
    } catch {
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

      setMessage({ text: data.message || "Pengaturan berhasil disimpan.", type: "success" });
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
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
              Lokasi Kantor &amp; Verifikasi Jaringan
            </h1>
            <span className="hig-badge hig-badge-neutral text-xs font-semibold px-2.5 py-0.5">
              Geofence &amp; IP WiFi
            </span>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Atur titik koordinat fisik kantor dan IP WiFi publik untuk validasi absensi karyawan.
          </p>
        </div>

        <button
          type="button"
          onClick={loadConfig}
          disabled={loading}
          className="hig-button-secondary text-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Muat Ulang</span>
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
            <CheckCircle2 className="w-4 h-4 shrink-0 text-[var(--system-green)]" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-[var(--system-red)]" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Main Form */}
      <form onSubmit={handleSave} className="space-y-6">
        {/* Section 1: Office GPS Geofence */}
        <div className="hig-card p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--separator-subtle)]">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[var(--accent)]" />
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Area Geofence Kantor
              </h2>
            </div>
            {config.enforceGeofence ? (
              <span className="hig-badge hig-badge-green text-xs font-medium">
                Geofence Aktif
              </span>
            ) : (
              <span className="hig-badge hig-badge-neutral text-xs font-medium">
                Nonaktif
              </span>
            )}
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-[var(--text-secondary)]">
              Nama Kantor / Cabang
            </label>
            <input
              type="text"
              value={config.officeName}
              onChange={(e) => setConfig({ ...config, officeName: e.target.value })}
              required
              placeholder="Kantor Utama"
              className="hig-input"
            />
          </div>

          {/* Interactive Visual Map & Geofence Picker */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-medium text-[var(--text-secondary)]">
                Peta Koordinat &amp; Lingkaran Geofence
              </label>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-[var(--text-tertiary)]">Pusatkan:</span>
                <select
                  onChange={(e) => {
                    const found = INDONESIA_CITY_PRESETS.find((c) => c.name === e.target.value);
                    if (found) setConfig((prev) => ({ ...prev, latitude: found.lat, longitude: found.lon }));
                  }}
                  defaultValue=""
                  className="hig-input py-1 px-2 text-xs w-auto"
                >
                  <option value="" disabled>Pilih Kota</option>
                  {INDONESIA_CITY_PRESETS.map((city) => (
                    <option key={city.name} value={city.name}>{city.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <MapLocationPicker
              latitude={config.latitude}
              longitude={config.longitude}
              radiusMeters={config.radiusMeters}
              onChange={({ latitude, longitude }) => {
                setConfig((prev) => ({ ...prev, latitude, longitude }));
              }}
              onRadiusChange={(radiusMeters) => {
                setConfig((prev) => ({ ...prev, radiusMeters }));
              }}
            />
          </div>

          {/* Location Capture Buttons */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleGetCurrentLocation}
              disabled={locating}
              className="hig-button-secondary text-xs flex items-center gap-1.5"
            >
              <Crosshair className={`w-3.5 h-3.5 ${locating ? "animate-spin" : ""}`} />
              <span>{locating ? "Membaca Satelit GPS..." : "Gunakan Titik GPS Saya"}</span>
            </button>
          </div>

          {/* Coordinate Numeric Inputs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-[var(--text-secondary)]">
                Latitude (Lintang)
              </label>
              <input
                type="number"
                step="0.000001"
                value={config.latitude}
                onChange={(e) => setConfig({ ...config, latitude: parseFloat(e.target.value) || 0 })}
                required
                className="hig-input font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-[var(--text-secondary)]">
                Longitude (Bujur)
              </label>
              <input
                type="number"
                step="0.000001"
                value={config.longitude}
                onChange={(e) => setConfig({ ...config, longitude: parseFloat(e.target.value) || 0 })}
                required
                className="hig-input font-mono"
              />
            </div>
          </div>

          {/* Radius & Accuracy */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-[var(--text-secondary)]">
                Radius Geofence (Meter)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="10"
                  max="1000"
                  value={config.radiusMeters}
                  onChange={(e) => setConfig({ ...config, radiusMeters: parseInt(e.target.value) || 50 })}
                  className="hig-input font-mono w-28 tabular-numbers"
                />
                <div className="flex gap-1">
                  {[25, 50, 100, 200].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setConfig({ ...config, radiusMeters: preset })}
                      className={`text-xs px-2 py-1 rounded transition-colors ${
                        config.radiusMeters === preset
                          ? "bg-[var(--accent)] text-white font-medium"
                          : "hig-button-secondary"
                      }`}
                    >
                      {preset}m
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-[var(--text-secondary)]">
                Batas Toleransi Akurasi GPS (Meter)
              </label>
              <input
                type="number"
                min="10"
                max="500"
                value={config.maxGpsAccuracy}
                onChange={(e) => setConfig({ ...config, maxGpsAccuracy: parseInt(e.target.value) || 80 })}
                className="hig-input font-mono w-28 tabular-numbers"
              />
            </div>
          </div>

          {/* Toggle: Enforce Geofence */}
          <div className="pt-3 border-t border-[var(--separator-subtle)] flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-[var(--text-primary)] block">
                Wajibkan Radius GPS
              </span>
              <span className="text-[11px] text-[var(--text-secondary)]">
                Presensi di luar radius {config.radiusMeters}m akan otomatis ditolak.
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config.enforceGeofence}
                onChange={(e) => setConfig({ ...config, enforceGeofence: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-10 h-5 bg-neutral-300 dark:bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--accent)]"></div>
            </label>
          </div>
        </div>

        {/* Section 2: Office WiFi Public IP Matching */}
        <div className="hig-card p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--separator-subtle)]">
            <div className="flex items-center gap-2">
              <Wifi className="w-4 h-4 text-[var(--accent)]" />
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Pencocokan IP WiFi Kantor
              </h2>
            </div>
            {config.enforceWifiIp ? (
              <span className="hig-badge hig-badge-green text-xs font-medium">
                Wajib WiFi
              </span>
            ) : (
              <span className="hig-badge hig-badge-neutral text-xs font-medium">
                Opsional
              </span>
            )}
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-[var(--text-secondary)]">
              IP Publik WiFi Kantor (WAN IP)
            </label>
            <div className="flex flex-col sm:flex-row gap-2 max-w-xl">
              <input
                type="text"
                value={config.officePublicIp || ""}
                onChange={(e) => setConfig({ ...config, officePublicIp: e.target.value })}
                placeholder="Misal: 180.252.12.34"
                className="hig-input font-mono flex-1"
              />
              <button
                type="button"
                onClick={handleGetMyIp}
                disabled={detectingIp}
                className="hig-button-secondary text-xs flex items-center gap-1.5 whitespace-nowrap"
              >
                <Globe className={`w-3.5 h-3.5 ${detectingIp ? "animate-spin" : ""}`} />
                <span>{detectingIp ? "Mendeteksi..." : "Gunakan IP Saat Ini"}</span>
              </button>
            </div>
          </div>

          {/* Toggle: Enforce WiFi IP */}
          <div className="pt-3 border-t border-[var(--separator-subtle)] flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-[var(--text-primary)] block">
                Wajibkan Terhubung ke WiFi Kantor
              </span>
              <span className="text-[11px] text-[var(--text-secondary)]">
                Presensi hanya diizinkan bila perangkat terhubung ke router WiFi kantor.
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config.enforceWifiIp}
                onChange={(e) => setConfig({ ...config, enforceWifiIp: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-10 h-5 bg-neutral-300 dark:bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--accent)]"></div>
            </label>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="hig-button-primary text-xs"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? "Menyimpan..." : "Simpan Pengaturan"}</span>
          </button>
        </div>
      </form>
    </div>
  );
}