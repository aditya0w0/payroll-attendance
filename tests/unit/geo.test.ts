import { describe, expect, it } from "vitest";
import { calculateHaversineDistance, isValidCoordinate } from "@/lib/geo";

describe("geofence distance and coordinate validation (src/lib/geo.ts)", () => {
  it("returns 0 meters for identical coordinates", () => {
    expect(calculateHaversineDistance(-6.2088, 106.8456, -6.2088, 106.8456)).toBe(0);
  });

  it("computes accurate short-range distance (~50m) for office geofence enforcement", () => {
    // 0.00045 deg latitude ≈ 50.04 meters
    const distance = calculateHaversineDistance(-6.2088, 106.8456, -6.20835, 106.8456);
    expect(distance).toBeGreaterThanOrEqual(49);
    expect(distance).toBeLessThanOrEqual(51);
  });

  it("computes accurate ~111km per 1 degree latitude at equator", () => {
    const distance = calculateHaversineDistance(0, 106, 1, 106);
    expect(distance).toBeGreaterThanOrEqual(111_100);
    expect(distance).toBeLessThanOrEqual(111_300);
  });

  it.each([
    { lat: -6.2088, lon: 106.8456, expected: true, label: "Jakarta coordinate" },
    { lat: -90, lon: -180, expected: true, label: "lower global bounds" },
    { lat: 90, lon: 180, expected: true, label: "upper global bounds" },
    { lat: 0, lon: 0, expected: true, label: "zero origin" },
    { lat: -90.0001, lon: 0, expected: false, label: "latitude below -90" },
    { lat: 90.0001, lon: 0, expected: false, label: "latitude above 90" },
    { lat: 0, lon: -180.0001, expected: false, label: "longitude below -180" },
    { lat: 0, lon: 180.0001, expected: false, label: "longitude above 180" },
    { lat: Number.NaN, lon: 106.8, expected: false, label: "NaN latitude" },
    { lat: -6.2, lon: Number.NaN, expected: false, label: "NaN longitude" },
    { lat: "-6.2" as unknown, lon: 106.8, expected: false, label: "string latitude" },
    { lat: null, lon: undefined, expected: false, label: "nullish inputs" },
  ])("isValidCoordinate($label) -> $expected", ({ lat, lon, expected }) => {
    expect(isValidCoordinate(lat, lon)).toBe(expected);
  });
});
