import { describe, expect, it } from "vitest";
import { extractActivityStatsFromHtml } from "../src/parse/activity-stats.ts";

/**
 * Synthetic HTML mirroring Strava's real activity stats DOM (verified
 * against the reference account's "Jour 7" + a generic ride with HR/cadence).
 */
function buildHtml(opts: {
  inlineStats: Array<[label: string, value: string]>;
  moreStats?: Array<{ label: string; avg?: string; max?: string; single?: string }>;
  device?: string;
}): string {
  const inlineLi = opts.inlineStats
    .map(([label, value]) => `<li><strong>${value}</strong><div class="label">${label}</div></li>`)
    .join("\n");
  const moreRows =
    opts.moreStats
      ?.map((row) => {
        if (row.single != null) {
          return `<tr><th>${row.label}</th><td colspan="2">${row.single}</td></tr>`;
        }
        return `<tr><th>${row.label}</th><td>${row.avg ?? ""}</td><td>${row.max ?? ""}</td></tr>`;
      })
      .join("\n") ?? "";
  const more = moreRows
    ? `<div class="section more-stats"><table><thead><tr><th></th><th>Moy.</th><th>Max.</th></tr></thead><tbody>${moreRows}</tbody></table></div>`
    : "";
  const device = opts.device ? `<div class="device spans8">${opts.device}</div>` : "";
  return `<html><body>
    <ul class="inline-stats">${inlineLi}</ul>
    ${more}
    ${device}
  </body></html>`;
}

describe("extractActivityStatsFromHtml — French locale (Paul-style)", () => {
  it("parses Distance / Moving time / Elevation / Power / Energy", () => {
    const html = buildHtml({
      inlineStats: [
        ["Distance", "95,57 km"],
        ["Durée de déplacement", "4:16:00"],
        ["Dénivelé positif", "932 m"],
        ["Puissance moy. estimée", "94 W"],
        ["Dépense d’énergie", "1 448 kJ"],
      ],
      moreStats: [
        { label: "Vitesse", avg: "22,4 km/h", max: "57,3 km/h" },
        { label: "Calories", single: "3 197" },
        { label: "Température", single: "15 ℃" },
        { label: "Temps écoulé", single: "6:13:55" },
      ],
      device: "Garmin Edge 1030 Plus",
    });
    const { stats, deviceName } = extractActivityStatsFromHtml(html);

    expect(stats.distanceMeters).toBe(95_570);
    expect(stats.movingTimeSeconds).toBe(4 * 3600 + 16 * 60); // 4:16:00 = 15360s
    expect(stats.totalElevationGainMeters).toBe(932);
    expect(stats.averageWatts).toBe(94);
    expect(stats.kilojoules).toBe(1448);
    // Avg/Max
    expect(stats.averageSpeedMetersPerSecond).toBeCloseTo(22.4 / 3.6, 2);
    expect(stats.maxSpeedMetersPerSecond).toBeCloseTo(57.3 / 3.6, 2);
    expect(stats.caloriesKcal).toBe(3197);
    expect(stats.averageTemperatureCelsius).toBe(15);
    expect(stats.elapsedTimeSeconds).toBe(6 * 3600 + 13 * 60 + 55);
    expect(deviceName).toBe("Garmin Edge 1030 Plus");
  });

  it("parses Heart Rate avg/max from more-stats table", () => {
    const html = buildHtml({
      inlineStats: [["Distance", "10,0 km"]],
      moreStats: [
        { label: "Vitesse", avg: "12,0 km/h", max: "18,5 km/h" },
        { label: "FC", avg: "152", max: "178" },
      ],
    });
    const { stats } = extractActivityStatsFromHtml(html);
    expect(stats.averageHeartrateBpm).toBe(152);
    expect(stats.maxHeartrateBpm).toBe(178);
  });

  it("parses Cadence avg/max", () => {
    const html = buildHtml({
      inlineStats: [["Distance", "10 km"]],
      moreStats: [{ label: "Cadence", avg: "85", max: "112" }],
    });
    const { stats } = extractActivityStatsFromHtml(html);
    expect(stats.averageCadence).toBe(85);
    expect(stats.maxCadence).toBe(112);
  });

  it("parses Power avg/max from real meter (not estimated)", () => {
    const html = buildHtml({
      inlineStats: [["Distance", "10 km"]],
      moreStats: [{ label: "Puissance", avg: "240 W", max: "850 W" }],
    });
    const { stats } = extractActivityStatsFromHtml(html);
    expect(stats.averageWatts).toBe(240);
    expect(stats.maxWatts).toBe(850);
  });

  it("ignores unknown labels gracefully", () => {
    const html = buildHtml({
      inlineStats: [
        ["Distance", "5 km"],
        ["Une stat inconnue de Strava", "999"],
      ],
    });
    const { stats } = extractActivityStatsFromHtml(html);
    expect(stats.distanceMeters).toBe(5000);
    // No new fields beyond distance
    expect(Object.keys(stats)).toEqual(["distanceMeters"]);
  });
});

describe("extractActivityStatsFromHtml — English locale", () => {
  it("parses Distance / Moving Time / Elevation / Speed (mph)", () => {
    const html = buildHtml({
      inlineStats: [
        ["Distance", "59.4 mi"],
        ["Moving Time", "4:16:00"],
        ["Elevation Gain", "3,058 ft"],
      ],
      moreStats: [
        { label: "Speed", avg: "13.9 mph", max: "35.6 mph" },
        { label: "Calories", single: "3,197" },
      ],
    });
    const { stats } = extractActivityStatsFromHtml(html);
    // 59.4 mi × 1609.34708 ≈ 95,595 m
    expect(stats.distanceMeters).toBe(95_595);
    // 3,058 ft × 0.3048 ≈ 932 m
    expect(stats.totalElevationGainMeters).toBe(932);
    expect(stats.movingTimeSeconds).toBe(4 * 3600 + 16 * 60);
    // 13.9 mph × 0.44704 ≈ 6.21 m/s
    expect(stats.averageSpeedMetersPerSecond).toBeCloseTo(13.9 * 0.44704, 2);
    expect(stats.maxSpeedMetersPerSecond).toBeCloseTo(35.6 * 0.44704, 2);
    expect(stats.caloriesKcal).toBe(3197);
  });

  it("converts °F to °C", () => {
    const html = buildHtml({
      inlineStats: [["Distance", "1 mi"]],
      moreStats: [{ label: "Temperature", single: "59 °F" }],
    });
    const { stats } = extractActivityStatsFromHtml(html);
    // (59 - 32) × 5/9 = 15
    expect(stats.averageTemperatureCelsius).toBe(15);
  });
});
