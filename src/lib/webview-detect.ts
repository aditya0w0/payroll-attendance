/**
 * In-App Browser (WebView) Detection & Compatibility Utility
 * Identifies embedded WebViews (WhatsApp, Telegram, Instagram, Line, Facebook, etc.)
 * where W3C WebAuthn / FIDO2 APIs are frequently disabled or blocked by permissions policy.
 */

export interface WebViewDetectionResult {
  isInApp: boolean;
  appName: string | null;
  isWebAuthnSupported: boolean;
  isSecureContext: boolean;
  canUsePasskey: boolean;
  reason: string | null;
}

/**
 * Detects whether the current client environment is inside an in-app WebView
 * and checks whether WebAuthn platform authenticators are supported.
 */
export function detectInAppWebView(customUserAgent?: string): WebViewDetectionResult {
  const isSecure = typeof window !== "undefined" ? Boolean(window.isSecureContext) : true;

  if (typeof window === "undefined" && !customUserAgent) {
    return {
      isInApp: false,
      appName: null,
      isWebAuthnSupported: true,
      isSecureContext: true,
      canUsePasskey: true,
      reason: null,
    };
  }

  const ua = customUserAgent || (typeof navigator !== "undefined" ? navigator.userAgent : "");

  let appName: string | null = null;

  if (/FBAN|FBAV/i.test(ua)) {
    appName = "Facebook";
  } else if (/Instagram/i.test(ua)) {
    appName = "Instagram";
  } else if (/WhatsApp/i.test(ua)) {
    appName = "WhatsApp";
  } else if (/Telegram/i.test(ua)) {
    appName = "Telegram";
  } else if (/Line\//i.test(ua) || /\bLine\b/i.test(ua)) {
    appName = "Line";
  } else if (/Twitter|TwitterAndroid/i.test(ua)) {
    appName = "Twitter / X";
  } else if (/MicroMessenger/i.test(ua)) {
    appName = "WeChat";
  } else if (/ByteLocale|TikTok|musical_ly/i.test(ua)) {
    appName = "TikTok";
  } else if (/Kakaotalk/i.test(ua)) {
    appName = "KakaoTalk";
  } else if (/(iPhone|iPod|iPad).*AppleWebKit(?!.*Safari)/i.test(ua)) {
    // iOS WKWebView inside native third-party app
    appName = "In-App Browser";
  } else if (/; wv\b/i.test(ua) || /Version\/4\.0.*Chrome/i.test(ua)) {
    // Android WebView component
    appName = "Android WebView";
  }

  const isInApp = Boolean(appName);

  // Check WebAuthn platform API availability
  const hasPublicKeyCredential =
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined" &&
    typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === "function";

  const isWebAuthnSupported = Boolean(hasPublicKeyCredential);
  const canUsePasskey = !isInApp && isWebAuthnSupported && isSecure;

  let reason: string | null = null;
  if (isInApp) {
    reason = `Terdeteksi dibuka melalui ${appName}. Browser internal aplikasi membatasi autentikasi biometrik WebAuthn.`;
  } else if (!isSecure) {
    reason = "Koneksi HTTP tidak aman (Insecure Context). Peramban membatasi WebAuthn / Passkey pada origin non-HTTPS.";
  } else if (!isWebAuthnSupported) {
    reason = "Browser ini tidak mendukung WebAuthn / FIDO2 Passkey. Gunakan browser modern (Safari, Chrome, atau Edge).";
  }

  return {
    isInApp,
    appName,
    isWebAuthnSupported,
    isSecureContext: isSecure,
    canUsePasskey,
    reason,
  };
}
