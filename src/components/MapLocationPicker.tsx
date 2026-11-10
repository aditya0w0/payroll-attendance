"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  MapPin,
  Crosshair,
  Search,
  Loader2,
  Navigation,
  Globe,
  CheckCircle2,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  acquirePrecisionLocation,
  fetchAddressFromCoords,
  searchPlacesByQuery,
  PrecisionLocationResult,
  DEFAULT_OFFICE_COORDS,
} from "@/lib/geo-browser";

interface MapLocationPickerProps {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  onChange: (coords: { latitude: number; longitude: number; address?: string }) => void;
  onRadiusChange?: (radius: number) => void;
}

export default function MapLocationPicker({
  latitude,
  longitude,
  radiusMeters,
  onChange,
  onRadiusChange,
}: MapLocationPickerProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const circleRef = useRef<any>(null);
  const accuracyCircleRef = useRef<any>(null);

  const [address, setAddress] = useState<string>("Memuat alamat...");
  const [loadingAddress, setLoadingAddress] = useState<boolean>(false);
  const [locating, setLocating] = useState<boolean>(false);
  const [locatingStatus, setLocatingStatus] = useState<string | null>(null);
  const [deviceAccuracy, setDeviceAccuracy] = useState<number | null>(null);

  // Address search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ displayName: string; name: string; latitude: number; longitude: number }>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const searchDebounceRef = useRef<any>(null);

  // Initialize Leaflet Map
  useEffect(() => {
    let isMounted = true;

    async function initMap() {
      if (typeof window === "undefined" || !mapContainerRef.current) return;
      if (mapInstanceRef.current) return; // Already initialized

      const L = (await import("leaflet")).default;

      if (!isMounted || !mapContainerRef.current) return;

      const initialLat = latitude || DEFAULT_OFFICE_COORDS.latitude;
      const initialLon = longitude || DEFAULT_OFFICE_COORDS.longitude;

      const map = L.map(mapContainerRef.current, {
        center: [initialLat, initialLon],
        zoom: 16,
        zoomControl: false,
      });

      mapInstanceRef.current = map;

      // Clean OpenStreetMap tiles
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      // Custom crisp SVG Pin Icon (Zero external asset dependencies)
      const pinHtml = `
        <div style="position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; transform: translate(-50%, -100%);">
          <svg width="36" height="46" viewBox="0 0 36 46" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0px 3px 6px rgba(0,0,0,0.3));">
            <path d="M18 0C8.05887 0 0 8.05887 0 18C0 28.5 15.5 44 18 46C20.5 44 36 28.5 36 18C36 8.05887 27.9411 0 18 0Z" fill="#0071E3"/>
            <circle cx="18" cy="18" r="7" fill="white"/>
            <circle cx="18" cy="18" r="4" fill="#0071E3"/>
          </svg>
        </div>
      `;

      const customPinIcon = L.divIcon({
        className: "custom-leaflet-pin",
        html: pinHtml,
        iconSize: [36, 46],
        iconAnchor: [18, 46],
      });

      // Draggable Office Center Marker
      const marker = L.marker([initialLat, initialLon], {
        icon: customPinIcon,
        draggable: true,
      }).addTo(map);
      markerRef.current = marker;

      // Geofence Radius Circle
      const circle = L.circle([initialLat, initialLon], {
        radius: radiusMeters,
        color: "#0071E3",
        weight: 2,
        fillColor: "#0071E3",
        fillOpacity: 0.15,
      }).addTo(map);
      circleRef.current = circle;

      // Handle marker drag end
      marker.on("dragend", async (e: any) => {
        const { lat, lng } = e.target.getLatLng();
        const newLat = Number(lat.toFixed(6));
        const newLon = Number(lng.toFixed(6));

        circle.setLatLng([newLat, newLon]);
        updateAddress(newLat, newLon);
        onChange({ latitude: newLat, longitude: newLon });
      });

      // Handle click on map to move marker
      map.on("click", (e: any) => {
        const { lat, lng } = e.latlng;
        const newLat = Number(lat.toFixed(6));
        const newLon = Number(lng.toFixed(6));

        marker.setLatLng([newLat, newLon]);
        circle.setLatLng([newLat, newLon]);
        updateAddress(newLat, newLon);
        onChange({ latitude: newLat, longitude: newLon });
      });

      // Fetch initial address
      updateAddress(initialLat, initialLon);
    }

    initMap();

    return () => {
      isMounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update marker & circle when latitude / longitude props change externally
  useEffect(() => {
    if (!mapInstanceRef.current || !markerRef.current || !circleRef.current) return;
    const current = markerRef.current.getLatLng();
    if (
      Math.abs(current.lat - latitude) > 0.00001 ||
      Math.abs(current.lng - longitude) > 0.00001
    ) {
      markerRef.current.setLatLng([latitude, longitude]);
      circleRef.current.setLatLng([latitude, longitude]);
      mapInstanceRef.current.panTo([latitude, longitude]);
      updateAddress(latitude, longitude);
    }
  }, [latitude, longitude]);

  // Update geofence circle radius when prop changes
  useEffect(() => {
    if (circleRef.current) {
      circleRef.current.setRadius(radiusMeters);
    }
  }, [radiusMeters]);

  // Fetch address helper
  const updateAddress = useCallback(async (lat: number, lon: number) => {
    setLoadingAddress(true);
    try {
      const addr = await fetchAddressFromCoords(lat, lon);
      setAddress(addr);
    } catch {
      setAddress(`${lat.toFixed(6)}, ${lon.toFixed(6)}`);
    } finally {
      setLoadingAddress(false);
    }
  }, []);

  // Handle High-Precision GPS Lock
  const handlePrecisionLocate = async () => {
    const isSecure =
      typeof window !== "undefined" &&
      (window.isSecureContext ||
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1");

    if (!isSecure) {
      setLocatingStatus("Browser memblokir izin GPS karena dibuka via HTTP biasa (bukan HTTPS). Buka via HTTPS agar GPS dapat aktif.");
      return;
    }

    setLocating(true);
    setLocatingStatus("Mengaktifkan satelit GPS...");

    try {
      const res: PrecisionLocationResult = await acquirePrecisionLocation(
        (info) => {
          setLocatingStatus(info.message);
          if (info.currentAccuracy) {
            setDeviceAccuracy(info.currentAccuracy);
          }
        },
        { targetAccuracyMeters: 20, maxAcquisitionMs: 15000, allowIpFallback: false }
      );

      if (res.error) {
        setLocatingStatus(res.error);
        return;
      }

      if (res.accuracy > 80) {
        setLocatingStatus(
          `Satelit GPS belum terkunci (akurasi seluler +/- ${res.accuracy}m terlalu kasar). Geser pin manual ke titik kantor atau pilih preset kota.`
        );
        return;
      }

      const lat = res.latitude;
      const lon = res.longitude;
      setDeviceAccuracy(res.accuracy);

      if (mapInstanceRef.current && markerRef.current && circleRef.current) {
        markerRef.current.setLatLng([lat, lon]);
        circleRef.current.setLatLng([lat, lon]);
        mapInstanceRef.current.flyTo([lat, lon], 17, { duration: 1.2 });

        // Add or update device accuracy indicator circle
        if (accuracyCircleRef.current) {
          accuracyCircleRef.current.remove();
        }

        const L = (await import("leaflet")).default;
        accuracyCircleRef.current = L.circle([lat, lon], {
          radius: res.accuracy,
          color: "#34C759",
          weight: 1.5,
          dashArray: "4, 6",
          fillColor: "#34C759",
          fillOpacity: 0.1,
        }).addTo(mapInstanceRef.current);
      }

      await updateAddress(lat, lon);
      onChange({ latitude: lat, longitude: lon, address: res.address });
      setLocatingStatus(
        `Lokasi terkunci! Akurasi +/- ${res.accuracy}m (${res.isHighPrecision ? "Satelit Presisi Tinggi" : "GPS Hardware"})`
      );
    } catch (err: any) {
      setLocatingStatus(`Gagal membaca GPS: ${err.message}`);
    } finally {
      setLocating(false);
    }
  };

  // Handle Search Input Change
  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    // Direct coordinate or Google Maps link detection
    const trimmed = val.trim();
    const gmapsMatch = trimmed.match(/(?:@|q=|\/place\/)(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/);
    const directMatch = trimmed.match(/^(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)$/);
    const coordMatch = gmapsMatch || directMatch;

    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lon = parseFloat(coordMatch[2]);
      if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        setSearchResults([
          {
            displayName: `Titik Koordinat: ${lat.toFixed(6)}, ${lon.toFixed(6)} (Klik untuk atur lokasi)`,
            name: `${lat.toFixed(6)}, ${lon.toFixed(6)}`,
            latitude: Number(lat.toFixed(6)),
            longitude: Number(lon.toFixed(6)),
          },
        ]);
        setShowSearchResults(true);
        setIsSearching(false);
        return;
      }
    }

    if (val.trim().length < 2) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    setIsSearching(true);
    searchDebounceRef.current = setTimeout(async () => {
      const results = await searchPlacesByQuery(val);
      setSearchResults(results);
      setIsSearching(false);
      setShowSearchResults(true);
    }, 400);
  };

  // Select Search Result
  const handleSelectSearchResult = (result: { latitude: number; longitude: number; displayName: string }) => {
    setShowSearchResults(false);
    setSearchQuery(result.displayName);

    const lat = Number(result.latitude.toFixed(6));
    const lon = Number(result.longitude.toFixed(6));

    if (mapInstanceRef.current && markerRef.current && circleRef.current) {
      markerRef.current.setLatLng([lat, lon]);
      circleRef.current.setLatLng([lat, lon]);
      mapInstanceRef.current.flyTo([lat, lon], 17, { duration: 1.2 });
    }

    setAddress(result.displayName);
    onChange({ latitude: lat, longitude: lon, address: result.displayName });
  };

  return (
    <div className="space-y-3">
      {/* Search Bar & Auto-Complete */}
      <div className="relative z-30">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={() => searchResults.length > 0 && setShowSearchResults(true)}
            placeholder="Cari nama jalan, kelurahan, kota, atau tempel koordinat Google Maps (-6.9287, 109.6555)..."
            className="w-full pl-9 pr-10 py-2.5 text-xs bg-neutral-50 dark:bg-[#2C2C2E] text-neutral-900 dark:text-neutral-100 border border-neutral-300 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder:text-neutral-400 dark:placeholder:text-neutral-500 shadow-sm"
          />
          <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-3" />
          {isSearching && (
            <Loader2 className="w-4 h-4 text-blue-500 animate-spin absolute right-3 top-3" />
          )}
        </div>

        {/* Search Results Dropdown */}
        {showSearchResults && searchResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-[#242426] border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg overflow-hidden max-h-56 overflow-y-auto z-40 divide-y divide-neutral-100 dark:divide-neutral-800">
            {searchResults.map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectSearchResult(item)}
                className="w-full text-left px-3.5 py-2.5 text-xs hover:bg-neutral-50 dark:hover:bg-[#2C2C2E] transition-colors flex items-start gap-2 text-neutral-800 dark:text-neutral-200"
              >
                <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                <span className="line-clamp-2 leading-relaxed">{item.displayName}</span>
              </button>
            ))}
          </div>
        )}

        {/* Empty Search Suggestion Card */}
        {showSearchResults && searchResults.length === 0 && !isSearching && searchQuery.trim().length >= 2 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-[#242426] border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg p-3 z-40 text-xs space-y-1.5">
            <div className="flex items-center gap-1.5 font-medium text-neutral-800 dark:text-neutral-200">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>Titik &quot;{searchQuery}&quot; tidak terdaftar di direktori OpenStreetMap</span>
            </div>
            <p className="text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
              Peta umum hanya mencatat nama jalan, kelurahan, atau kota (bukan nama toko/usaha privat). Silakan cari nama jalan/kelurahan terdekat, atau tempel koordinat dari Google Maps (contoh: <span className="font-mono text-neutral-700 dark:text-neutral-300">-6.9287, 109.6555</span>), lalu geser pin biru ke lokasi tepat pintu kantor Anda.
            </p>
          </div>
        )}
      </div>

      {/* Map Viewport Container */}
      <div className="relative rounded-xl overflow-hidden border border-neutral-300 dark:border-neutral-700 shadow-sm bg-neutral-100 dark:bg-neutral-900">
        <div
          ref={mapContainerRef}
          className="w-full h-[320px] sm:h-[380px] z-10 [&_.leaflet-tile]:dark:invert [&_.leaflet-tile]:dark:hue-rotate-180 [&_.leaflet-tile]:dark:brightness-95 [&_.leaflet-tile]:dark:contrast-90"
        />

        {/* Map Control Buttons Overlay */}
        <div className="absolute top-3 right-3 z-20 flex flex-col gap-2">
          {/* High Precision GPS Lock */}
          <button
            type="button"
            onClick={handlePrecisionLocate}
            disabled={locating}
            title="Kunci titik lokasi GPS saya saat ini dengan presisi tinggi"
            className="bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur text-blue-600 dark:text-blue-400 border border-neutral-200 dark:border-neutral-700 hover:bg-blue-50 dark:hover:bg-neutral-800 p-2.5 rounded-lg shadow-md transition-all flex items-center justify-center disabled:opacity-50"
          >
            {locating ? (
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
            ) : (
              <Crosshair className="w-4 h-4" />
            )}
          </button>

          {/* Zoom In & Out */}
          <div className="bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-md overflow-hidden flex flex-col">
            <button
              type="button"
              onClick={() => mapInstanceRef.current?.zoomIn()}
              className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 transition-colors border-b border-neutral-200 dark:border-neutral-700"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => mapInstanceRef.current?.zoomOut()}
              className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 transition-colors"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Bottom Map Helper Overlay */}
        <div className="absolute bottom-2 left-2 right-2 z-20 pointer-events-none">
          <div className="bg-white/90 dark:bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-neutral-200/80 dark:border-neutral-800/80 text-[11px] text-neutral-700 dark:text-neutral-300 flex items-center justify-between shadow-sm">
            <span className="flex items-center gap-1.5 font-medium">
              <Navigation className="w-3.5 h-3.5 text-blue-500" />
              <span>Geser pin atau klik peta untuk atur titik gerbang/pintu kantor</span>
            </span>
            <span className="font-mono text-blue-600 dark:text-blue-400 font-semibold">
              Radius: {radiusMeters}m
            </span>
          </div>
        </div>
      </div>

      {/* Selected Location Details Card */}
      <div className="p-3 bg-neutral-50 dark:bg-[#2C2C2E]/60 border border-neutral-200 dark:border-neutral-800 rounded-lg space-y-2 text-xs">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <MapPin className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 block uppercase tracking-wider">
                Alamat Fisik Terpilih
              </span>
              <p className="font-medium text-neutral-900 dark:text-neutral-100 leading-snug">
                {loadingAddress ? "Mencari alamat lokasi..." : address}
              </p>
            </div>
          </div>
          {deviceAccuracy !== null && (
            <span
              className={`shrink-0 text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold border ${
                deviceAccuracy <= 25
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                  : deviceAccuracy <= 80
                  ? "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400"
                  : "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400"
              }`}
            >
              Akurasi GPS: +/- {deviceAccuracy}m
            </span>
          )}
        </div>

        {/* Location Status Message (when locating) */}
        {locatingStatus && (
          <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800 flex items-center gap-2 text-neutral-600 dark:text-neutral-400 text-[11px]">
            {locating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500 shrink-0" />
            ) : locatingStatus.includes("Gagal") ? (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            )}
            <span>{locatingStatus}</span>
          </div>
        )}
      </div>

      {/* Radius Quick Presets */}
      {onRadiusChange && (
        <div className="flex items-center justify-between text-xs pt-1">
          <span className="text-neutral-600 dark:text-neutral-400">Pilih Radius Geofence:</span>
          <div className="flex gap-1.5 font-mono">
            {[20, 50, 100, 200].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => onRadiusChange(preset)}
                className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${
                  radiusMeters === preset
                    ? "bg-blue-600 text-white font-medium border-transparent shadow-sm"
                    : "bg-neutral-100 dark:bg-[#2C2C2E] text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700 hover:bg-neutral-200 dark:hover:bg-[#3A3A3C]"
                }`}
              >
                {preset}m
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
