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
    <div className="w-full h-80 rounded-xl bg-neutral-100 dark:bg-neutral-800 animate-pulse flex flex-col items-center justify-center gap-2 text-xs text-neutral-500">
      <Compass className="w-6 h-6 animate-spin text-blue-500" />
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
  { name: "Buaran (Pekalongan)", lat: -6.9338, lon: 109.6541 },
  { name: "Pekalongan Kota", lat: -6.8886, lon: 109.6753 },
  { name: "Semarang", lat: -6.9904, lon: 110.4229 },
  { name: "Jakarta", lat: -6.2088, lon: 106.8456 },
  { name: "Surabaya", lat: -7.2575, lon: 112.7521 },
  { name: "Bandung", lat: -6.9175, lon: 107.6191 },
  { name: "Yogyakarta", lat: -7.7956, lon: 110.3695 },
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
  const [detectingIpLocation, setDetectingIpLocation] = useState(false);
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

  // Multi-Sample Precision GPS Acquisition
  const handleGetCurrentLocation = async () => {
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
          text: `Satelit GPS belum terkunci (akurasi seluler +/- ${res.accuracy}m terlalu kasar). Geser pin manual ke titik kantor atau pilih preset Buaran (Pekalongan).`,
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
        text: `Titik GPS berhasil diperbarui (${res.latitude}, ${res.longitude}) dengan akurasi +/- ${res.accuracy}m (${
          res.isHighPrecision ? "Presisi Satelit Tinggi" : "GPS Hardware"
        }).`,
        type: "success",
      });
    } catch (err: any) {
      setMessage({
        text: `Gagal membaca GPS: ${err.message}. Pastikan izin lokasi aktif pada browser Anda.`,
        type: "error",
      });
    } finally {
      setLocating(false);
    }
  };

  // Detect and set coordinates from public IP / network
  const handleUseIpLocation = async () => {
    try {
      setDetectingIpLocation(true);
      setMessage(null);

      const targetIp = config.officePublicIp || "";
      const res = await fetch(`/api/geo/ip-lookup?ip=${encodeURIComponent(targetIp)}`);
      const data = await res.json();

      if (data.latitude && data.longitude) {
        setConfig((prev) => ({
          ...prev,
          latitude: Number(data.latitude.toFixed(6)),
          longitude: Number(data.longitude.toFixed(6)),
        }));
        setMessage({
          text: `Koordinat disesuaikan ke wilayah IP (${data.city || "Kota"}, ${data.region || ""}): ${data.latitude}, ${data.longitude}. Catatan: Jaringan seluler sering diarahkan ke gateway operator regional (misal Tegal/Semarang). Gunakan GPS Satelit atau tombol preset Pekalongan untuk lokasi fisik akurat.`,
          type: "success",
        });
      }
    } catch {
      setMessage({ text: "Gagal mendeteksi koordinat dari IP jaringan.", type: "error" });
    } finally {
      setDetectingIpLocation(false);
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
          text: `IP Publik WiFi terdeteksi: ${data.ip}`,
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
            Konfigurasi koordinat fisik kantor dan IP WiFi publik untuk mencegah kecurangan absen foto/jastip.
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

          <div className="space-y-1.5">
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

          {/* Interactive Visual Map & Geofence Picker */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                Peta Lokasi &amp; Lingkaran Geofence
              </label>
              <div className="flex items-center gap-1.5 text-xs flex-wrap">
                <span className="text-neutral-500 dark:text-neutral-400 text-[11px]">Kota Cepat:</span>
                {INDONESIA_CITY_PRESETS.map((city) => (
                  <button
                    key={city.name}
                    type="button"
                    onClick={() => setConfig({ ...config, latitude: city.lat, longitude: city.lon })}
                    className="text-[11px] px-2 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
                  >
                    {city.name}
                  </button>
                ))}
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
              className="bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-lg px-3.5 py-2 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 shadow-sm"
            >
              <Crosshair className={`w-3.5 h-3.5 ${locating ? "animate-spin" : ""}`} />
              <span>{locating ? "Mengunci Satelit GPS..." : "Gunakan Lokasi GPS Saya (Presisi Tinggi)"}</span>
            </button>

            <button
              type="button"
              onClick={handleUseIpLocation}
              disabled={detectingIpLocation}
              className="bg-neutral-100 dark:bg-[#2C2C2E] text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-200 dark:hover:bg-[#3A3A3C] rounded-lg px-3 py-2 text-xs font-medium inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <Globe className={`w-3.5 h-3.5 ${detectingIpLocation ? "animate-spin" : ""}`} />
              <span>{detectingIpLocation ? "Mendeteksi..." : "Gunakan Wilayah IP Jaringan"}</span>
            </button>
          </div>

          {/* Coordinate Numeric Inputs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
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

          {/* Geofence Radius & Accuracy Settings */}
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
                  {[20, 50, 100, 200].map((preset) => (
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

        {/* Section 2: Office WiFi Public IP Matching */}
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
              IP publik router WiFi kantor (Biznet, IndiHome, CBN, MyRepublic, XL). Buka halaman ini menggunakan WiFi kantor dan klik tombol deteksi.
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
