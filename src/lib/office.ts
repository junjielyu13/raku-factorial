// Office location. Single source of truth for the geofence warning on the
// admin dashboard. Previously stored in the `office_locations` table; moved
// here because we only ever have one office and never enforce the radius.
// To move the office, update the values below and redeploy.

export interface OfficeCoords {
  latitude: number;
  longitude: number;
}

export const OFFICE = {
  name: 'Oficina Principal',
  latitude: 41.478107,
  longitude: 2.084087,
  radius_meters: 200,
} as const;

export const OFFICES: OfficeCoords[] = [
  { latitude: OFFICE.latitude, longitude: OFFICE.longitude },
];
