import { describe, expect, it } from "vitest";
import { extractActivityWeatherFromHtml } from "../src/parse/activity-stats.ts";

describe("extractActivityWeatherFromHtml", () => {
  it("parses the full FR weather panel (Paul/Sam style)", () => {
    const html = `<html><body>
      <div class="weather-stats">
        <div class="weather-column">
          <div class="weather-stat">
            <div class="weather-label">Nuages</div>
          </div>
          <div class="weather-stat">
            <div class="weather-label">Température</div>
            <div class="weather-value">15  ℃</div>
          </div>
          <div class="weather-stat">
            <div class="weather-label">Humidité</div>
            <div class="weather-value">90%</div>
          </div>
        </div>
        <div class="weather-column">
          <div class="weather-stat">
            <div class="weather-label">Ressenti</div>
            <div class="weather-value">12  ℃</div>
          </div>
          <div class="weather-stat">
            <div class="weather-label">Vitesse du vent</div>
            <div class="weather-value">4,7 km/h</div>
          </div>
          <div class="weather-stat">
            <div class="weather-label">Direction du vent</div>
            <div class="weather-value">WNW</div>
          </div>
        </div>
      </div>
    </body></html>`;
    const w = extractActivityWeatherFromHtml(html);
    expect(w).toBeDefined();
    expect(w?.description).toBe("Nuages");
    expect(w?.temperatureCelsius).toBe(15);
    expect(w?.feelsLikeCelsius).toBe(12);
    expect(w?.humidityPercent).toBe(90);
    expect(w?.windSpeedMetersPerSecond).toBeCloseTo(4.7 / 3.6, 2);
    expect(w?.windDirectionText).toBe("WNW");
  });

  it("converts °F → °C and mph → m/s in EN locale", () => {
    const html = `<html><body>
      <div class="weather-stats">
        <div class="weather-stat">
          <div class="weather-label">Temperature</div>
          <div class="weather-value">59 °F</div>
        </div>
        <div class="weather-stat">
          <div class="weather-label">Wind speed</div>
          <div class="weather-value">5 mph</div>
        </div>
      </div>
    </body></html>`;
    const w = extractActivityWeatherFromHtml(html);
    expect(w?.temperatureCelsius).toBe(15); // (59-32)×5/9
    expect(w?.windSpeedMetersPerSecond).toBeCloseTo(5 * 0.44704, 2);
  });

  it("returns undefined when no weather panel is present", () => {
    expect(extractActivityWeatherFromHtml("<html><body></body></html>")).toBeUndefined();
  });
});
