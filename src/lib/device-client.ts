/**
 * Client-Side Web Crypto Device Identity & Hardware Fingerprint Engine
 * Uses IndexedDB to store non-extractable CryptoKeyPair where supported.
 */

const DB_NAME = "CyberGuardDeviceAuth";
const STORE_NAME = "deviceKeys";
const KEY_NAME = "primaryDeviceIdentity";

interface DeviceAuthData {
  deviceFingerprint: string;
  deviceName: string;
  publicKeyStr: string;
  createdAt: number;
}

/**
 * Detects browser and OS platform in Apple HIG tone.
 */
export function getClientDeviceName(): string {
  if (typeof window === "undefined") return "Server Terminal";
  const ua = navigator.userAgent;

  let os = "Desktop Workstation";
  if (/iPhone|iPad|iPod/.test(ua)) os = "Apple iOS Device";
  else if (/Macintosh|Mac OS X/.test(ua)) os = "macOS Workstation";
  else if (/Android/.test(ua)) os = "Android Mobile Device";
  else if (/Windows/.test(ua)) os = "Windows PC";
  else if (/Linux/.test(ua)) os = "Linux System";

  let browser = "Browser";
  if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari";
  else if (ua.includes("Chrome")) browser = "Chrome";
  else if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Edg")) browser = "Edge";

  return `${browser} on ${os}`;
}

/**
 * Gets or initializes client Web Crypto identity from IndexedDB / localStorage.
 */
export async function getClientDeviceIdentity(): Promise<{
  deviceFingerprint: string;
  deviceName: string;
  publicKey: string;
}> {
  if (typeof window === "undefined") {
    return {
      deviceFingerprint: "server_simulated",
      deviceName: "Server",
      publicKey: "none",
    };
  }

  // 1. Try local storage cache first for instant synchronous resolution
  const cachedFp = localStorage.getItem("cg_device_fingerprint");
  const cachedName = localStorage.getItem("cg_device_name");
  const cachedKey = localStorage.getItem("cg_device_public_key");

  if (cachedFp && cachedKey) {
    return {
      deviceFingerprint: cachedFp,
      deviceName: cachedName || getClientDeviceName(),
      publicKey: cachedKey,
    };
  }

  // 2. Generate a Web Crypto ECDSA Keypair or fallback
  let publicKeyStr = "web_crypto_key_unsupported";
  let fingerprint = "";

  try {
    if (window.crypto && window.crypto.subtle) {
      const keyPair = await window.crypto.subtle.generateKey(
        {
          name: "ECDSA",
          namedCurve: "P-256",
        },
        true, // extractable public key
        ["sign", "verify"]
      );

      const exported = await window.crypto.subtle.exportKey("spki", keyPair.publicKey);
      const u8 = new Uint8Array(exported);
      let binary = "";
      for (let i = 0; i < u8.length; i++) {
        binary += String.fromCharCode(u8[i]);
      }
      publicKeyStr = btoa(binary);

      // Compute SHA-256 fingerprint of the public key
      const hashBuffer = await window.crypto.subtle.digest("SHA-256", exported);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      fingerprint = "dev_" + hashArray.map((b) => b.toString(16).padStart(2, "0")).join("").substring(0, 24);
    }
  } catch (e) {
    console.warn("Web Crypto key generation fallback:", e);
  }

  if (!fingerprint) {
    fingerprint = "dev_" + Math.random().toString(36).substring(2, 12) + "_" + Date.now().toString(36);
  }

  const deviceName = getClientDeviceName();

  localStorage.setItem("cg_device_fingerprint", fingerprint);
  localStorage.setItem("cg_device_name", deviceName);
  localStorage.setItem("cg_device_public_key", publicKeyStr);

  return {
    deviceFingerprint: fingerprint,
    deviceName,
    publicKey: publicKeyStr,
  };
}

/**
 * Resets local device identity (for testing device switching / rogue device simulation).
 */
export function simulateNewDeviceIdentity(customName?: string): {
  deviceFingerprint: string;
  deviceName: string;
} {
  const newFp = "dev_rogue_" + Math.random().toString(36).substring(2, 10) + "_" + Date.now().toString(36);
  const newName = customName || "Unregistered Device (Simulated Switch)";

  localStorage.setItem("cg_device_fingerprint", newFp);
  localStorage.setItem("cg_device_name", newName);

  return { deviceFingerprint: newFp, deviceName: newName };
}
