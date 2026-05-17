// src/lib/geolocation.ts
export interface Coords {
  latitude: number;
  longitude: number;
  accuracy_m: number;
}

export function getPosition(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('NO_GEOLOCATION'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy_m: pos.coords.accuracy,
      }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) reject(new Error('PERMISSION_DENIED'));
        else if (err.code === err.POSITION_UNAVAILABLE) reject(new Error('UNAVAILABLE'));
        else if (err.code === err.TIMEOUT) reject(new Error('TIMEOUT'));
        else reject(err);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
    );
  });
}
