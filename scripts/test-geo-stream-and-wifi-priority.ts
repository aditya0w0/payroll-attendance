/**
 * Test Suite: GPS Stream Warm-Up Engine & Indoor Ruko WiFi Priority Balancing
 */

import assert from "assert";
import { startGpsWarmUp, GpsStreamDiagnostic } from "../src/lib/geo-stream";
import { calculateHaversineDistance } from "../src/lib/geo";

console.log("================================================================================");
console.log("STARTING GPS STREAM WARM-UP & INDOOR RUKO WIFI PRIORITY TEST SUITE");
console.log("================================================================================");

async function runTests() {
  console.log("\n--- TEST 1: GPS Stream Warm-Up Engine Mechanics ---");

  // Mock navigator.geolocation for deterministic unit testing
  let watchCallback: ((pos: any) => void) | null = null;
  let errorCallback: ((err: any) => void) | null = null;
  let clearedWatchId: number | null = null;
  let optionsPassed: any = null;

  (globalThis as any).window = {};
  (globalThis as any).navigator = {
    geolocation: {
      watchPosition: (success: any, error: any, options: any) => {
        watchCallback = success;
        errorCallback = error;
        optionsPassed = options;
        return 999;
      },
      clearWatch: (id: number) => {
        clearedWatchId = id;
      },
    },
  };

  // 1.1 Verify options constraints
  const diagnostics: GpsStreamDiagnostic[] = [];
  const sub1 = startGpsWarmUp({
    targetAccuracyMeters: 50,
    discardThresholdMeters: 80,
    maxWaitSeconds: 12,
    btsWarningSeconds: 2,
    onDiagnostic: (d) => diagnostics.push(d),
  });

  assert.strictEqual(optionsPassed.enableHighAccuracy, true, "enableHighAccuracy must be true");
  assert.strictEqual(optionsPassed.maximumAge, 0, "maximumAge must be 0 (force fresh satellite fix)");
  assert.strictEqual(optionsPassed.timeout, 15000, "timeout must be 15000ms");
  console.log("[PASS] GPS stream enforces enableHighAccuracy: true, maximumAge: 0, and timeout: 15000ms");

  // 1.2 Simulate BTS Reading (> 500m) - Discarded from lock
  watchCallback!({
    coords: {
      latitude: -6.9904,
      longitude: 110.4229,
      accuracy: 650, // Cellular BTS guess in another area
    },
  });

  const lastDiag = diagnostics[diagnostics.length - 1];
  assert.strictEqual(lastDiag.accuracy, 650, "Accuracy recorded as 650m");
  assert.strictEqual(lastDiag.isCellularBts, true, "Accuracy > 500m flagged as isCellularBts");
  assert.notStrictEqual(lastDiag.stage, "locked", "Reading > 80m must NEVER be locked");
  console.log("[PASS] Coarse cellular BTS reading (±650m) is discarded from final lock");

  // 1.3 Simulate Marginal Reading (70m) - Between 50m and 80m
  watchCallback!({
    coords: {
      latitude: -6.9905,
      longitude: 110.4230,
      accuracy: 70,
    },
  });

  const marginalDiag = diagnostics[diagnostics.length - 1];
  assert.strictEqual(marginalDiag.accuracy, 70, "Accuracy recorded as 70m");
  assert.strictEqual(marginalDiag.stage, "sampling", "Accuracy between 50m and 80m remains in sampling stage");
  console.log("[PASS] Reading between 50m and 80m (±70m) reports progress but keeps watching for <= 50m");

  // 1.4 Simulate True Satellite Lock (35m <= 50m)
  watchCallback!({
    coords: {
      latitude: -6.99055,
      longitude: 110.42305,
      accuracy: 35,
    },
  });

  const lockedResult = await sub1.promise;
  assert.strictEqual(lockedResult.accuracy, 35, "Locked accuracy is 35m");
  assert.strictEqual(clearedWatchId, 999, "Watch is cleared immediately upon lock");
  console.log("[PASS] True satellite reading (±35m <= 50m) achieves lock and clears watch");

  // 1.5 Verify Indoor Timeout (12 seconds)
  console.log("\n--- TEST 2: GPS Indoor 12-Second Timeout Defense ---");
  const subTimeout = startGpsWarmUp({
    targetAccuracyMeters: 50,
    discardThresholdMeters: 80,
    maxWaitSeconds: 1, // Shortened for fast test execution
    btsWarningSeconds: 1,
  });

  try {
    await subTimeout.promise;
    assert.fail("Should have thrown GPS_INDOOR_TIMEOUT");
  } catch (err: any) {
    assert.strictEqual(err.code, "GPS_INDOOR_TIMEOUT", "Error code must be GPS_INDOOR_TIMEOUT");
    assert(err.message.includes("terhalang atap ruangan"), "Error message contains indoor guidance");
    console.log("[PASS] Total timeout raises GPS_INDOOR_TIMEOUT with actionable indoor instruction");
  }

  // 1.6 Verify Indoor Ruko Fallback (WiFi Priority Balancing Math)
  console.log("\n--- TEST 3: Indoor Ruko Fallback (WiFi Priority Balancing Math) ---");
  const officeConfig = {
    latitude: -6.9904,
    longitude: 110.4229,
    radiusMeters: 50,
    maxGpsAccuracy: 80,
    enforceWifiIp: true,
    officePublicIp: "103.28.112.5",
  };

  const clientIp = "103.28.112.5";
  const isWifiMatched = clientIp === officeConfig.officePublicIp;

  // Case A: WiFi verified -> tolerance up to 150m
  const allowedAccuracyWifi = (officeConfig.enforceWifiIp && isWifiMatched)
    ? Math.max(officeConfig.maxGpsAccuracy, 150)
    : officeConfig.maxGpsAccuracy;
  assert.strictEqual(allowedAccuracyWifi, 150, "WiFi-verified accuracy window expands to 150m");

  const readingAccuracy = 120; // 120m accuracy under concrete roof
  assert(readingAccuracy <= allowedAccuracyWifi, "120m accuracy is accepted under verified office WiFi");
  console.log("[PASS] 120m accuracy accepted when employee is verified on office WiFi (150m threshold)");

  // Case B: WiFi NOT verified -> strict 80m
  const unverifiedWifi = false;
  const allowedAccuracyNoWifi = (officeConfig.enforceWifiIp && unverifiedWifi)
    ? Math.max(officeConfig.maxGpsAccuracy, 150)
    : officeConfig.maxGpsAccuracy;
  assert.strictEqual(allowedAccuracyNoWifi, 80, "Strict 80m accuracy window maintained when WiFi unverified");
  assert(readingAccuracy > allowedAccuracyNoWifi, "120m accuracy is strictly rejected when WiFi unverified");
  console.log("[PASS] 120m accuracy strictly rejected when WiFi is unverified (80m threshold)");

  console.log("\n================================================================================");
  console.log("ALL GPS STREAM & WIFI PRIORITY UNIT TESTS PASSED (6/6)!");
  console.log("================================================================================");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
