/**
 * Unit Test Suite: In-App Browser (WebView) Detection & Compatibility
 */

import { detectInAppWebView } from "../src/lib/webview-detect";

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`[PASS] ${testName}${detail ? ` (${detail})` : ""}`);
  } else {
    failedTests++;
    console.error(`[FAIL] ${testName}${detail ? ` - Detail: ${detail}` : ""}`);
  }
}

async function runWebViewTests() {
  console.log("================================================================================");
  console.log("STARTING IN-APP BROWSER (WEBVIEW) DETECTION TESTS");
  console.log("================================================================================");

  // 1. WhatsApp iOS WebView
  const waIosUA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21E236 WhatsApp/24.8.78";
  const waResult = detectInAppWebView(waIosUA);
  assert(waResult.isInApp === true, "WhatsApp iOS detected as in-app WebView");
  assert(waResult.appName === "WhatsApp", "App name correctly identified as WhatsApp");
  assert(waResult.canUsePasskey === false, "canUsePasskey is false in WhatsApp WebView");

  // 2. Telegram Android WebView
  const tgAndroidUA = "Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.6367.113 Mobile Safari/537.36 Telegram-Android/10.12.0";
  const tgResult = detectInAppWebView(tgAndroidUA);
  assert(tgResult.isInApp === true, "Telegram Android detected as in-app WebView");
  assert(tgResult.appName === "Telegram", "App name correctly identified as Telegram");
  assert(tgResult.canUsePasskey === false, "canUsePasskey is false in Telegram WebView");

  // 3. Instagram iOS WebView
  const igIosUA = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/20F66 Instagram 287.0.0.25.77";
  const igResult = detectInAppWebView(igIosUA);
  assert(igResult.isInApp === true, "Instagram iOS detected as in-app WebView");
  assert(igResult.appName === "Instagram", "App name correctly identified as Instagram");

  // 4. Line Messaging App
  const lineUA = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari/604.1 Line/13.4.0";
  const lineResult = detectInAppWebView(lineUA);
  assert(lineResult.isInApp === true, "Line detected as in-app WebView");
  assert(lineResult.appName === "Line", "App name correctly identified as Line");

  // 5. Facebook In-App Browser (FBAN / FBAV)
  const fbUA = "Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230805.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/115.0.5790.166 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/427.0.0.30.64;]";
  const fbResult = detectInAppWebView(fbUA);
  assert(fbResult.isInApp === true, "Facebook app detected via FBAV signature");
  assert(fbResult.appName === "Facebook", "App name correctly identified as Facebook");

  // 6. Generic Android WebView (; wv)
  const genericWvUA = "Mozilla/5.0 (Linux; U; Android 12; en-us; SM-A125F Build/SP1A.210812.016; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/106.0.5249.126 Mobile Safari/537.36";
  const genericResult = detectInAppWebView(genericWvUA);
  assert(genericResult.isInApp === true, "Generic Android WebView detected");
  assert(genericResult.canUsePasskey === false, "Generic Android WebView disallows passkey");

  // 7. Standard Mobile Safari (Legitimate Browser)
  const safariUA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
  const safariResult = detectInAppWebView(safariUA);
  assert(safariResult.isInApp === false, "Standard Mobile Safari is NOT detected as in-app");
  assert(safariResult.appName === null, "App name is null for standard Mobile Safari");

  // 8. Standard Chrome on Android (Legitimate Browser)
  const chromeUA = "Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.179 Mobile Safari/537.36";
  const chromeResult = detectInAppWebView(chromeUA);
  assert(chromeResult.isInApp === false, "Standard Chrome on Android is NOT detected as in-app");

  console.log("\n================================================================================");
  console.log(`WEBVIEW DETECTION TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
  console.log("================================================================================");

  if (failedTests > 0) {
    process.exit(1);
  }
}

runWebViewTests().catch((e) => {
  console.error("Test execution fatal error:", e);
  process.exit(1);
});
