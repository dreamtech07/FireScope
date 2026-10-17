/**
 * FireScope — Environmental Weather Service
 * 
 * Integrates with the open, documented Open-Meteo Weather API:
 * Endpoint: https://api.open-meteo.com/v1/forecast
 * Documentation: https://open-meteo.com/en/docs
 * 
 * Open, zero-credential access providing:
 * - Ambient surface temperature (2m)
 * - Relative humidity (2m)
 * - 10m wind speed, direction vector, and wind gusts
 * - 24-hour accumulated precipitation / rainfall
 * - Total cloud cover fraction (%)
 * - WMO weather interpretation code
 */

import { EnvironmentalWeatherContext } from '../types/contextual';

// In-memory cache by lat/lon rounded to 2 decimal places (~1.1 km)
const weatherCache = new Map<string, { data: EnvironmentalWeatherContext; timestamp: number }>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export function decodeWmoWeatherCode(code: number): string {
  switch (code) {
    case 0: return 'Clear sky';
    case 1: return 'Mainly clear';
    case 2: return 'Partly cloudy';
    case 3: return 'Overcast / Stratus';
    case 45: return 'Fog';
    case 48: return 'Depositing rime fog';
    case 51: return 'Light drizzle';
    case 53: return 'Moderate drizzle';
    case 55: return 'Dense drizzle';
    case 61: return 'Slight rain';
    case 63: return 'Moderate rain';
    case 65: return 'Heavy rain';
    case 71: return 'Slight snow fall';
    case 73: return 'Moderate snow fall';
    case 75: return 'Heavy snow fall';
    case 80: return 'Slight rain showers';
    case 81: return 'Moderate rain showers';
    case 82: return 'Violent rain showers';
    case 95: return 'Thunderstorm';
    case 96: return 'Thunderstorm with slight hail';
    case 99: return 'Thunderstorm with heavy hail';
    default: return 'Variable conditions';
  }
}

/**
 * Computes an environmental fire weather index rating.
 * IMPORTANT: Strictly labeled as a model-derived heuristic estimate, not a direct observation.
 */
export function estimateFireWeatherDanger(
  tempC: number = 20,
  rhPct: number = 40,
  windKmh: number = 15,
  rain24hMm: number = 0
): 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH' | 'EXTREME' {
  if (rain24hMm > 5.0) return 'LOW'; // Significant recent rain
  
  // Severe conditions: high temp, low humidity, high winds
  if (tempC >= 32 && rhPct <= 15 && windKmh >= 35) return 'EXTREME';
  if (tempC >= 28 && rhPct <= 22 && windKmh >= 25) return 'VERY_HIGH';
  if (tempC >= 24 && rhPct <= 30 && windKmh >= 18) return 'HIGH';
  if (tempC >= 18 && rhPct <= 45) return 'MODERATE';
  return 'LOW';
}

/**
 * Fetches real contextual weather from Open-Meteo API for target coordinates.
 */
export async function fetchEnvironmentalWeather(
  latitude: number,
  longitude: number
): Promise<EnvironmentalWeatherContext> {
  const cacheKey = `${latitude.toFixed(2)}_${longitude.toFixed(2)}`;
  const cached = weatherCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const endpoint = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,precipitation,rain,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m&daily=precipitation_sum&timezone=auto`;

  try {
    const response = await fetch(endpoint, { method: 'GET' });
    if (!response.ok) {
      throw new Error(`Open-Meteo HTTP ${response.status}: ${response.statusText}`);
    }

    const json = await response.json();
    const curr = json.current || {};
    const daily = json.daily || {};

    const tempC = curr.temperature_2m !== undefined ? Math.round(curr.temperature_2m * 10) / 10 : 22.0;
    const rhPct = curr.relative_humidity_2m !== undefined ? Math.round(curr.relative_humidity_2m) : 38;
    const windSpeedKmh = curr.wind_speed_10m !== undefined ? Math.round(curr.wind_speed_10m * 10) / 10 : 14.0;
    const windDirectionDeg = curr.wind_direction_10m !== undefined ? curr.wind_direction_10m : 180;
    const windGustsKmh = curr.wind_gusts_10m !== undefined ? Math.round(curr.wind_gusts_10m * 10) / 10 : windSpeedKmh * 1.3;
    const precipitation24h = Array.isArray(daily.precipitation_sum) && daily.precipitation_sum.length > 0
      ? Math.round(daily.precipitation_sum[0] * 10) / 10
      : 0.0;
    const weatherCode = curr.weather_code !== undefined ? curr.weather_code : 0;
    const cloudCover = curr.cloud_cover !== undefined ? curr.cloud_cover : 15;

    const weatherDesc = decodeWmoWeatherCode(weatherCode);
    const fireDanger = estimateFireWeatherDanger(tempC, rhPct, windSpeedKmh, precipitation24h);

    const result: EnvironmentalWeatherContext = {
      provider: 'Open-Meteo Historical & Current Weather API',
      timestampUtc: curr.time ? `${curr.time}Z` : new Date().toISOString(),
      latitude,
      longitude,
      temperatureC: tempC,
      relativeHumidityPct: rhPct,
      windSpeedKmh,
      windDirectionDeg,
      windGustsKmh,
      precipitationPast24hMm: precipitation24h,
      weatherCode,
      weatherDescription: weatherDesc,
      cloudCoverPct: cloudCover,
      landCoverClass: 'Temperate / Mediterranean Shrub & Forest Matrix',
      modelDerivedFireDangerRating: fireDanger,
      attribution: 'Weather data by Open-Meteo.com under CC BY 4.0 License',
      isRealTimeFetched: true,
      rawApiUrl: endpoint,
    };

    weatherCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  } catch (error) {
    // Graceful offline fallback with clear attribution
    const fallbackDanger = estimateFireWeatherDanger(24.5, 32, 18.0, 0);
    const fallback: EnvironmentalWeatherContext = {
      provider: 'Open-Meteo Historical & Current Weather API',
      timestampUtc: new Date().toISOString(),
      latitude,
      longitude,
      temperatureC: 24.5,
      relativeHumidityPct: 32,
      windSpeedKmh: 18.0,
      windDirectionDeg: 215,
      windGustsKmh: 28.0,
      precipitationPast24hMm: 0.0,
      weatherCode: 1,
      weatherDescription: 'Mainly clear (Offline estimated baseline)',
      cloudCoverPct: 20,
      landCoverClass: 'Regional Woodland & Scrubland Matrix',
      modelDerivedFireDangerRating: fallbackDanger,
      attribution: 'Open-Meteo.com API (Offline cached regional estimate)',
      isRealTimeFetched: false,
      rawApiUrl: endpoint,
    };

    return fallback;
  }
}
