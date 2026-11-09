/**
 * Dynamic Platform & Device Name Parser
 * Extracts human-readable device name and platform categorization from the User-Agent header.
 */

export interface ParsedDeviceInfo {
  deviceName: string;
  platform: string;
}

export function parseDeviceNameFromUserAgent(userAgent?: string | null): ParsedDeviceInfo {
  if (!userAgent || typeof userAgent !== "string" || userAgent.trim().length === 0) {
    return {
      deviceName: "WebAuthn Platform Authenticator",
      platform: "WebAuthn Platform",
    };
  }

  const ua = userAgent.trim();

  // 1. iPhone / iPad (iOS / iPadOS)
  if (/iPhone/i.test(ua)) {
    return {
      deviceName: "iPhone (iOS)",
      platform: "iOS",
    };
  }

  if (/iPad/i.test(ua)) {
    return {
      deviceName: "iPad (iPadOS)",
      platform: "iPadOS",
    };
  }

  // 2. macOS (Safari, Chrome, Firefox, Edge)
  if (/Macintosh|Mac OS X/i.test(ua)) {
    let browser = "Safari";
    if (/Edg\//i.test(ua)) {
      browser = "Edge";
    } else if (/Chrome|CriOS/i.test(ua)) {
      browser = "Chrome";
    } else if (/Firefox|FxiOS/i.test(ua)) {
      browser = "Firefox";
    } else if (/Safari/i.test(ua)) {
      browser = "Safari";
    } else {
      browser = "Browser";
    }

    return {
      deviceName: `Mac (macOS / ${browser})`,
      platform: "macOS",
    };
  }

  // 3. Android
  if (/Android/i.test(ua)) {
    // Attempt to extract device model e.g. "Pixel 8", "SM-S918B"
    const modelMatch = ua.match(/;\s*([^;)]+)\s+Build\//i);
    const model = modelMatch?.[1]?.trim();
    if (model && !/Android|Linux|wv|Mobile/i.test(model) && model.length <= 30) {
      return {
        deviceName: `${model} (Android)`,
        platform: "Android",
      };
    }
    return {
      deviceName: "Android Device",
      platform: "Android",
    };
  }

  // 4. Windows (Windows Hello)
  if (/Windows/i.test(ua)) {
    return {
      deviceName: "PC (Windows Hello)",
      platform: "Windows",
    };
  }

  // 5. ChromeOS
  if (/CrOS/i.test(ua)) {
    return {
      deviceName: "Chromebook",
      platform: "ChromeOS",
    };
  }

  // 6. Linux Workstation
  if (/Linux/i.test(ua)) {
    return {
      deviceName: "Linux Workstation",
      platform: "Linux",
    };
  }

  // 7. Generic Fallback
  return {
    deviceName: "WebAuthn Platform Authenticator",
    platform: "WebAuthn Platform",
  };
}
