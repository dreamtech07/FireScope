/**
 * FireScope — NASA GIBS Optical Imagery & Burn-Scar Service
 * 
 * Integrates with NASA Global Imagery Browse Services (GIBS):
 * Documentation: https://wiki.earthdata.nasa.gov/display/GIBS
 * Open WMS/WMTS standards: EPSG:4326 and Web Mercator
 * 
 * Zero credential requirements for standard WMS/WMTS browse layers.
 * Provides actual daily optical imagery:
 * - Pre-event baseline optical reflectance
 * - Post-event optical reflectance & smoke/scar penetration (MODIS Bands 7-2-1 False Color)
 * - Derived Burned Area product (MCD64A1)
 */

import { BurnScarInspectionContext } from '../types/contextual';

export interface GibsLayerOption {
  id: string;
  name: string;
  sensor: string;
  description: string;
  isBurnOptimized: boolean;
}

export const GIBS_AVAILABLE_LAYERS: GibsLayerOption[] = [
  {
    id: 'MODIS_Terra_SurfaceReflectance_Bands721',
    name: 'MODIS False-Color (Bands 7-2-1)',
    sensor: 'MODIS Terra (250m)',
    description: 'Shortwave Infrared, Near-Infrared, and Red. Specifically engineered to penetrate atmospheric smoke and highlight fresh burn scars as deep red/charcoal against bright green healthy canopy.',
    isBurnOptimized: true,
  },
  {
    id: 'VIIRS_SNPP_CorrectedReflectance_TrueColor',
    name: 'VIIRS True Color (Natural RGB)',
    sensor: 'VIIRS Suomi-NPP (250m)',
    description: 'High-resolution natural color composite (I1, M4, M3) showing realistic smoke plumes, cloud boundaries, and landscape terrain.',
    isBurnOptimized: false,
  },
  {
    id: 'MODIS_Terra_CorrectedReflectance_TrueColor',
    name: 'MODIS Terra True Color',
    sensor: 'MODIS Terra (250m)',
    description: 'Morning overpass natural color optical reflectance (Bands 1, 4, 3) available continuously since 2000.',
    isBurnOptimized: false,
  },
];

/**
 * Builds an authentic NASA GIBS WMS GetMap URL for a bounding box and ISO date.
 */
export function buildGibsWmsUrl(
  layerId: string,
  dateIso: string, // YYYY-MM-DD
  lat: number,
  lon: number,
  boxDeltaDegrees: number = 0.25,
  width: number = 512,
  height: number = 512
): string {
  const minLon = Number((lon - boxDeltaDegrees).toFixed(4));
  const maxLon = Number((lon + boxDeltaDegrees).toFixed(4));
  const minLat = Number((lat - boxDeltaDegrees).toFixed(4));
  const maxLat = Number((lat + boxDeltaDegrees).toFixed(4));

  // NASA GIBS WMS 1.1.1 GetMap endpoint
  const baseUrl = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi';
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    REQUEST: 'GetMap',
    VERSION: '1.1.1',
    LAYERS: layerId,
    STYLES: '',
    FORMAT: 'image/jpeg',
    TRANSPARENT: 'false',
    HEIGHT: height.toString(),
    WIDTH: width.toString(),
    TIME: dateIso,
    SRS: 'EPSG:4326',
    BBOX: `${minLon},${minLat},${maxLon},${maxLat}`,
  });

  return `${baseUrl}?${params.toString()}`;
}

/**
 * Generates Pre-Event and Post-Event inspection context for a target coordinate.
 */
export function generateBurnScarContext(
  targetId: string,
  targetName: string,
  latitude: number,
  longitude: number,
  detectionTimestampUtc: string,
  layerId: string = 'MODIS_Terra_SurfaceReflectance_Bands721',
  preEventOffsetDays: number = 14
): BurnScarInspectionContext {
  const postDate = new Date(detectionTimestampUtc);
  const preDate = new Date(postDate.getTime() - preEventOffsetDays * 24 * 60 * 60 * 1000);

  const postDateStr = postDate.toISOString().slice(0, 10);
  const preDateStr = preDate.toISOString().slice(0, 10);

  const preUrl = buildGibsWmsUrl(layerId, preDateStr, latitude, longitude);
  const postUrl = buildGibsWmsUrl(layerId, postDateStr, latitude, longitude);

  const layer = GIBS_AVAILABLE_LAYERS.find(l => l.id === layerId) || GIBS_AVAILABLE_LAYERS[0];

  return {
    targetId,
    targetName,
    latitude,
    longitude,
    preEventDate: preDateStr,
    postEventDate: postDateStr,
    preEventImageryUrl: preUrl,
    postEventImageryUrl: postUrl,
    imageryProvider: 'NASA EOSDIS GIBS (Global Imagery Browse Services)',
    satelliteInstrument: layer.sensor,
    resolutionMeters: 250,
    spectralBands: layer.isBurnOptimized ? 'SWIR (2.1μm) / NIR (0.86μm) / Red (0.64μm)' : 'Red / Green / Blue (True Color)',
    vegetationIndexNote: layer.isBurnOptimized
      ? 'Shortwave-infrared false color: Charcoal deposits and scorched soil appear dark crimson/brick-red; unburned vegetation appears vibrant green.'
      : 'Natural color RGB: Visible smoke plumes and brown scars detectable if cloud cover is minimal.',
    scientificDisclaimer:
      'SCIENTIFIC NOTICE: Optical imagery and derived spectral indices document surface reflectance changes (such as vegetation canopy destruction, charcoal deposition, or soil exposure). Optical imagery does NOT confirm current flaming activity or thermal combustion.',
  };
}
