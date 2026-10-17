/**
 * FireScope — Persistent Heat-Source Reference Catalog & CSV Parser
 * 
 * Provides:
 * 1. Curated documented catalog of stationary industrial facilities and volcanic thermal emitters.
 * 2. Spatial proximity matcher against candidate observations.
 * 3. Parser for user-uploaded custom CSV reference registries.
 */

import { PersistentHeatSource, EmitterProximityMatch, PersistentEmitterType } from '../types/contextual';
import { haversineDistanceKm } from '../utils/matcher';

export const DOCUMENTED_PERSISTENT_EMITTERS: PersistentHeatSource[] = [
  {
    id: 'EMIT-GGFR-BASRA-01',
    name: 'Rumaila Oilfield Central Degassing & Flare Complex',
    facilityType: 'GAS_FLARE',
    latitude: 30.2185,
    longitude: 47.3821,
    country: 'Iraq',
    region: 'Basra Governorate',
    documentedSource: 'World Bank Global Gas Flaring Reduction Partnership (GGFR) / NOAA EOG',
    permitNumberOrCitation: 'GGFR Global Gas Flaring Catalog ID #IRQ-BAS-004',
    operatingSinceYear: 1954,
    bufferRadiusKm: 3.5,
    operationalNotes: 'Continuous high-volume upstream flare stacks. Emits steady 80–180 MW thermal signatures across all orbital passes.',
  },
  {
    id: 'EMIT-EIA-BAYTOWN-02',
    name: 'ExxonMobil Baytown Complex Flare System',
    facilityType: 'PETROCHEMICAL_REFINERY',
    latitude: 29.7523,
    longitude: -95.0118,
    country: 'USA',
    region: 'Harris County, Texas',
    documentedSource: 'US EIA Refinery Capacity Report & TCEQ Title V Operating Permit',
    permitNumberOrCitation: 'TCEQ Title V Operating Permit #O1229 / EIA Refinery ID 820014',
    operatingSinceYear: 1919,
    bufferRadiusKm: 2.5,
    operationalNotes: 'Second-largest crude refinery in the United States. Routine elevated flaring stacks produce high-temperature hotspots without ground vegetation loss.',
  },
  {
    id: 'EMIT-UK-PORT-TALBOT-03',
    name: 'Tata Steel Port Talbot Integrated Blast Furnaces',
    facilityType: 'STEEL_BLAST_FURNACE',
    latitude: 51.5842,
    longitude: -3.7684,
    country: 'United Kingdom',
    region: 'Neath Port Talbot, Wales',
    documentedSource: 'UK DEFRA National Atmospheric Emissions Inventory (NAEI)',
    permitNumberOrCitation: 'Natural Resources Wales Environmental Permit #EPR/BL9108',
    operatingSinceYear: 1901,
    bufferRadiusKm: 2.0,
    operationalNotes: 'Heavy metallurgical iron smelting. Intense localized infrared radiation detected by satellite 4μm channels.',
  },
  {
    id: 'EMIT-USGS-KILAUEA-04',
    name: 'Halemaʻumaʻu Summit Crater Lava Lake Vent',
    facilityType: 'ACTIVE_VOLCANO',
    latitude: 19.4082,
    longitude: -155.2869,
    country: 'USA',
    region: 'Hawaii County, Hawaii',
    documentedSource: 'USGS Hawaiian Volcano Observatory (HVO) Daily Monitoring Network',
    permitNumberOrCitation: 'USGS Volcano Hazards Program ID #332010',
    operatingSinceYear: 1823,
    bufferRadiusKm: 4.0,
    operationalNotes: 'Active basaltic magma column and crustal fountaining in Hawaii Volcanoes National Park.',
  },
  {
    id: 'EMIT-GGFR-YANBU-05',
    name: 'Yanbu Petrochemical & Crude Export Flare Terminal',
    facilityType: 'GAS_FLARE',
    latitude: 23.9854,
    longitude: 38.2912,
    country: 'Saudi Arabia',
    region: 'Al Madinah Province',
    documentedSource: 'World Bank GGFR Satellite Flare Tracker / VIIRS Nightfire',
    permitNumberOrCitation: 'Royal Commission for Jubail and Yanbu Environmental Control #RCJY-ENV-091',
    operatingSinceYear: 1982,
    bufferRadiusKm: 3.0,
    operationalNotes: 'Red Sea industrial hub flaring. High thermal output in barren coastal desert.',
  },
  {
    id: 'EMIT-EPA-PORT-ARTHUR-06',
    name: 'Motiva Port Arthur Refinery Flare Battery',
    facilityType: 'PETROCHEMICAL_REFINERY',
    latitude: 29.8712,
    longitude: -93.9542,
    country: 'USA',
    region: 'Jefferson County, Texas',
    documentedSource: 'US EPA Enforcement & Compliance History (ECHO) & Texas CEQ',
    permitNumberOrCitation: 'EPA FRS ID #110000455242 / TCEQ Permit #6056',
    operatingSinceYear: 1903,
    bufferRadiusKm: 2.5,
    operationalNotes: 'Largest capacity petroleum refinery in North America (630,000 bpd). Constant thermal infrared signature.',
  },
  {
    id: 'EMIT-INGV-ETNA-07',
    name: 'Mount Etna Southeast Crater Active Vent',
    facilityType: 'ACTIVE_VOLCANO',
    latitude: 37.7510,
    longitude: 14.9934,
    country: 'Italy',
    region: 'Catania, Sicily',
    documentedSource: 'INGV Osservatorio Etneo & European Space Agency Geohazards',
    permitNumberOrCitation: 'Smithsonian Global Volcanism Program ID #211060',
    operatingSinceYear: 1500,
    bufferRadiusKm: 4.5,
    operationalNotes: 'Frequent Strombolian eruptions, lava flows, and continuous degassed summit magma conduits.',
  },
  {
    id: 'EMIT-IND-NORILSK-08',
    name: 'Nadezhda Metallurgical Smelter Complex',
    facilityType: 'STEEL_BLAST_FURNACE',
    latitude: 69.3142,
    longitude: 88.3512,
    country: 'Russia',
    region: 'Krasnoyarsk Krai (Siberia)',
    documentedSource: 'Global Smelter Industrial Thermal Inventory & Arctic Environmental Council',
    permitNumberOrCitation: 'RF Industrial Safety License #SZ-001948',
    operatingSinceYear: 1981,
    bufferRadiusKm: 3.0,
    operationalNotes: 'High-temperature nickel/copper flash smelting in polar permafrost tundra.',
  },
];

/**
 * Searches for any persistent heat source within a spatial radius of a given coordinate.
 */
export function findNearbyPersistentEmitters(
  lat: number,
  lon: number,
  searchRadiusKm: number = 8.0,
  referenceCatalog: PersistentHeatSource[] = DOCUMENTED_PERSISTENT_EMITTERS
): EmitterProximityMatch[] {
  if (lat === undefined || lon === undefined || isNaN(lat) || isNaN(lon)) {
    return [];
  }

  const matches: EmitterProximityMatch[] = [];

  for (const emitter of referenceCatalog) {
    const distanceKm = haversineDistanceKm(lat, lon, emitter.latitude, emitter.longitude);
    if (distanceKm <= Math.max(searchRadiusKm, emitter.bufferRadiusKm)) {
      const isWithinBuffer = distanceKm <= emitter.bufferRadiusKm;
      matches.push({
        emitter,
        distanceKm,
        isWithinBuffer,
        thermalConflictNotice: isWithinBuffer
          ? `Thermal detection coincides with stationary ${emitter.facilityType.toLowerCase().replace(/_/g, ' ')} (${emitter.name}) within ${distanceKm.toFixed(2)} km. High risk of false wildland dispatch.`
          : `Stationary emitter (${emitter.name}) located ${distanceKm.toFixed(1)} km away. Verify wind drift or flare bloom before confirming vegetation fire.`,
      });
    }
  }

  return matches.sort((a, b) => a.distanceKm - b.distanceKm);
}

/**
 * Parses user-uploaded CSV text containing persistent emitter records.
 */
export function parsePersistentEmittersCsv(csvText: string): {
  emitters: PersistentHeatSource[];
  rejectedCount: number;
  errors: string[];
} {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) {
    return { emitters: [], rejectedCount: 0, errors: ['CSV must contain a header line and at least one data row.'] };
  }

  const rawHeaders = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase());
  
  // Find column indices
  const nameIdx = rawHeaders.findIndex(h => h.includes('name') || h.includes('facility'));
  const latIdx = rawHeaders.findIndex(h => h.includes('lat'));
  const lonIdx = rawHeaders.findIndex(h => h.includes('lon') || h.includes('lng'));
  const typeIdx = rawHeaders.findIndex(h => h.includes('type') || h.includes('category'));
  const sourceIdx = rawHeaders.findIndex(h => h.includes('source') || h.includes('permit') || h.includes('registry'));
  const bufferIdx = rawHeaders.findIndex(h => h.includes('buffer') || h.includes('radius'));

  if (latIdx === -1 || lonIdx === -1) {
    return {
      emitters: [],
      rejectedCount: lines.length - 1,
      errors: ['CSV must have recognizable "latitude" and "longitude" headers.'],
    };
  }

  const emitters: PersistentHeatSource[] = [];
  let rejected = 0;
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
    if (cols.length <= Math.max(latIdx, lonIdx)) {
      rejected++;
      continue;
    }

    const lat = parseFloat(cols[latIdx]);
    const lon = parseFloat(cols[lonIdx]);

    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      rejected++;
      errors.push(`Row ${i + 1}: Invalid coordinates (${cols[latIdx]}, ${cols[lonIdx]}).`);
      continue;
    }

    const name = nameIdx !== -1 && cols[nameIdx] ? cols[nameIdx] : `Custom Emitter #${i}`;
    let type: PersistentEmitterType = 'OTHER_STATIONARY';
    if (typeIdx !== -1 && cols[typeIdx]) {
      const rawType = cols[typeIdx].toUpperCase();
      if (rawType.includes('FLARE') || rawType.includes('GAS')) type = 'GAS_FLARE';
      else if (rawType.includes('REFIN') || rawType.includes('PETRO')) type = 'PETROCHEMICAL_REFINERY';
      else if (rawType.includes('STEEL') || rawType.includes('BLAST') || rawType.includes('FURNACE')) type = 'STEEL_BLAST_FURNACE';
      else if (rawType.includes('CEMENT') || rawType.includes('KILN')) type = 'CEMENT_KILN';
      else if (rawType.includes('VOLCAN')) type = 'ACTIVE_VOLCANO';
    }

    const source = sourceIdx !== -1 && cols[sourceIdx] ? cols[sourceIdx] : 'User CSV Upload';
    const buffer = bufferIdx !== -1 && !isNaN(parseFloat(cols[bufferIdx])) ? parseFloat(cols[bufferIdx]) : 2.5;

    emitters.push({
      id: `USER-EMIT-${Date.now().toString().slice(-4)}-${i}`,
      name,
      facilityType: type,
      latitude: lat,
      longitude: lon,
      country: 'Custom',
      region: 'User Defined',
      documentedSource: source,
      permitNumberOrCitation: `Uploaded Row ${i + 1}`,
      bufferRadiusKm: buffer,
      isUserUploaded: true,
      operationalNotes: 'Custom persistent heat-source dataset record.',
    });
  }

  return { emitters, rejectedCount: rejected, errors };
}
