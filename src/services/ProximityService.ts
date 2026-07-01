import { EmergencyAlert } from '../types';

import { WORKER_URL as API_URL } from '../config';

export interface NearbyAlert {
  id: string;
  lat: number;
  lng: number;
  distanceMeters: number;
  directionDegrees: number;
  description: string;
  category: string;
  batteryLevel: number;
  elapsedSeconds: number;
  status: 'active' | 'attending' | 'resolved';
  attendedBy: string | null;
  userName: string;
  trustScore: number;
}

// Calcular distancia Haversine entre dos puntos GPS en metros
export function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000; // Radio de la Tierra en metros
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Calcular dirección en grados (0=Norte, 90=Este, 180=Sur, 270=Oeste)
export function calculateBearing(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const lat1Rad = lat1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;

  const y = Math.sin(dLng) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
            Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);
  let brng = Math.atan2(y, x) * 180 / Math.PI;
  brng = (brng + 360) % 360;
  return brng;
}

// Convertir grados a texto: "Norte", "Noreste", etc.
export function bearingToText(degrees: number): string {
  const index = Math.round(degrees / 45) % 8;
  const directions = ['Norte', 'Noreste', 'Este', 'Sureste', 'Sur', 'Suroeste', 'Oeste', 'Noroeste'];
  return directions[index];
}

// Obtener alertas cercanas en radio dado en metros
export async function getNearbyAlerts(
  userLat: number,
  userLng: number,
  radiusMeters: number = 500
): Promise<NearbyAlert[]> {
  try {
    const res = await fetch(`${API_URL}/api/alerts`);
    if (!res.ok) throw new Error('Fallo al obtener alertas');
    const alerts: any[] = await res.json();
    const now = Date.now();

    return alerts
      .map((alert: any) => {
        const lat = parseFloat(alert.latitude);
        const lng = parseFloat(alert.longitude);
        const distance = haversineDistance(userLat, userLng, lat, lng);
        const direction = calculateBearing(userLat, userLng, lat, lng);
        const elapsed = alert.created_at ? Math.max(0, Math.floor((now - new Date(alert.created_at).getTime()) / 1000)) : 0;

        return {
          id: alert.id,
          lat,
          lng,
          distanceMeters: Math.round(distance),
          directionDegrees: direction,
          description: alert.description || 'Alerta de pánico',
          category: alert.connection_type || 'hybrid',
          batteryLevel: alert.battery_level || 100,
          elapsedSeconds: elapsed,
          status: alert.status || 'active',
          attendedBy: alert.attended_by || alert.attendedBy || null,
          userName: alert.user_name || 'Anónimo',
          trustScore: alert.trust_score || alert.trustScore || 0.5
        };
      })
      .filter((alert: NearbyAlert) => alert.distanceMeters <= radiusMeters)
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
  } catch (err) {
    console.error('Error en getNearbyAlerts:', err);
    return [];
  }
}

// Marcar alerta como "En atención" por un operador
export async function markAsAttending(
  alertId: string,
  operatorName: string,
  adminToken?: string
): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (adminToken) {
    headers['x-admin-token'] = adminToken;
  }
  const res = await fetch(`${API_URL}/api/alerts/attend`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ alertId, operatorName })
  });
  if (!res.ok) {
    throw new Error('No se pudo marcar como atendida');
  }
}

// Marcar alerta como resuelta
export async function markAsResolved(
  alertId: string,
  adminToken?: string
): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (adminToken) {
    headers['x-admin-token'] = adminToken;
  }
  const res = await fetch(`${API_URL}/api/alerts/resolve`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ alertId })
  });
  if (!res.ok) {
    throw new Error('No se pudo marcar como resuelta');
  }
}

// Suscribirse a alertas cercanas con actualización automática
export function subscribeToNearbyAlerts(
  userLat: number,
  userLng: number,
  radiusMeters: number,
  onUpdate: (alerts: NearbyAlert[]) => void,
  intervalMs: number = 5000
): () => void {
  const update = async () => {
    const alerts = await getNearbyAlerts(userLat, userLng, radiusMeters);
    onUpdate(alerts);
  };
  update();
  const interval = setInterval(update, intervalMs);
  return () => clearInterval(interval);
}
