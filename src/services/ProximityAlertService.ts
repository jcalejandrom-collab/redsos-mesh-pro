import { 
  listenToAllActiveAlertsForProximity, 
  markUserAsHelper, 
  countHelpers 
} from '../utils/firebase';
import { WORKER_URL as API_URL } from '../config';

export interface NearbyAlert {
  id: string;
  lat: number;
  lng: number;
  distanceMeters: number;
  directionText: string; // "Norte", "Noreste", etc.
  description: string;
  category: 'medical' | 'rescue' | 'fire' | 'general';
  elapsedSeconds: number;
  status: 'active' | 'attending' | 'resolved';
  userName: string;
  userId?: string;
}

// Calcular distancia Haversine entre dos puntos GPS en metros
export function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371e3; // Radio de la Tierra en metros
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distancia en metros
}

// Calcular dirección cardinal desde el usuario hacia la alerta
export function calculateDirection(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): string {
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;

  const y = Math.sin(dLng) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLng);

  let bearing = (Math.atan2(y, x) * 180) / Math.PI;
  bearing = (bearing + 360) % 360; // Normalizar entre 0 y 360

  const directions = [
    "Norte",
    "Noreste",
    "Este",
    "Sureste",
    "Sur",
    "Suroeste",
    "Oeste",
    "Noroeste"
  ];
  const index = Math.round(bearing / 45) % 8;
  return directions[index];
}

// Obtener alertas activas en un radio dado (default 1000m)
export async function getNearbyAlerts(
  userLat: number,
  userLng: number,
  radiusMeters: number = 1000
): Promise<NearbyAlert[]> {
  return new Promise((resolve) => {
    const unsubscribe = listenToAllActiveAlertsForProximity((alerts) => {
      unsubscribe(); // Desuscribirse inmediatamente para simular un "get" único
      const nearby: NearbyAlert[] = alerts
        .map((alert: any) => {
          const lat = alert.latitude || alert.lat || 0;
          const lng = alert.longitude || alert.lng || 0;
          const dist = haversineDistance(userLat, userLng, lat, lng);
          const dir = calculateDirection(userLat, userLng, lat, lng);

          // Clasificar categoría
          let cat: 'medical' | 'rescue' | 'fire' | 'general' = 'general';
          const classification = (alert.classification || "").toLowerCase();
          const flags = alert.flags;

          if (classification.includes("medical") || flags === 1) {
            cat = "medical";
          } else if (classification.includes("rescue") || flags === 2) {
            cat = "rescue";
          } else if (classification.includes("fire") || flags === 4) {
            cat = "fire";
          }

          // Calcular tiempo transcurrido
          let elapsed = 0;
          if (alert.timestamp) {
            const date = alert.timestamp.toDate ? alert.timestamp.toDate() : new Date(alert.timestamp);
            elapsed = Math.floor((Date.now() - date.getTime()) / 1000);
          }

          return {
            id: alert.id,
            lat,
            lng,
            distanceMeters: dist,
            directionText: dir,
            description: alert.description || "Alerta de Emergencia",
            category: cat,
            elapsedSeconds: elapsed > 0 ? elapsed : 0,
            status: alert.status || "active",
            userName: alert.userName || alert.source || "Civil",
            userId: alert.userId || alert.deviceId || ""
          } as NearbyAlert;
        })
        .filter((alert) => alert.distanceMeters <= radiusMeters && alert.status !== "resolved");

      // Ordenar por distancia ascendente
      nearby.sort((a, b) => a.distanceMeters - b.distanceMeters);
      resolve(nearby);
    });
  });
}

// Suscripción en tiempo real a alertas cercanas
export function subscribeToProximityAlerts(
  userLat: number,
  userLng: number,
  radiusMeters: number,
  onNewAlert: (alert: NearbyAlert) => void,
  onUpdate: (alerts: NearbyAlert[]) => void
): () => void {
  const alertedIds = new Set<string>();

  const unsubscribe = listenToAllActiveAlertsForProximity((alerts) => {
    const nearbyList: NearbyAlert[] = alerts
      .map((alert: any) => {
        const lat = alert.latitude || alert.lat || 0;
        const lng = alert.longitude || alert.lng || 0;
        const dist = haversineDistance(userLat, userLng, lat, lng);
        const dir = calculateDirection(userLat, userLng, lat, lng);

        let cat: 'medical' | 'rescue' | 'fire' | 'general' = 'general';
        const classification = (alert.classification || "").toLowerCase();
        const flags = alert.flags;

        if (classification.includes("medical") || flags === 1) {
          cat = "medical";
        } else if (classification.includes("rescue") || flags === 2) {
          cat = "rescue";
        } else if (classification.includes("fire") || flags === 4) {
          cat = "fire";
        }

        let elapsed = 0;
        if (alert.timestamp) {
          const date = alert.timestamp.toDate ? alert.timestamp.toDate() : new Date(alert.timestamp);
          elapsed = Math.floor((Date.now() - date.getTime()) / 1000);
        }

        return {
          id: alert.id,
          lat,
          lng,
          distanceMeters: dist,
          directionText: dir,
          description: alert.description || "Alerta de Emergencia",
          category: cat,
          elapsedSeconds: elapsed > 0 ? elapsed : 0,
          status: alert.status || "active",
          userName: alert.userName || alert.source || "Civil",
          userId: alert.userId || alert.deviceId || ""
        } as NearbyAlert;
      })
      .filter((alert) => alert.distanceMeters <= radiusMeters && alert.status !== "resolved");

    // Ordenar por distancia
    nearbyList.sort((a, b) => a.distanceMeters - b.distanceMeters);

    // Disparar callback para nuevas alertas que no hemos visto antes
    nearbyList.forEach((alert) => {
      if (!alertedIds.has(alert.id)) {
        alertedIds.add(alert.id);
        onNewAlert(alert);
      }
    });

    onUpdate(nearbyList);
  });

  return unsubscribe;
}

// Solicitar permiso de notificaciones push del navegador
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) {
    console.warn("Este navegador no soporta notificaciones de escritorio.");
    return false;
  }
  
  if (Notification.permission === 'granted') {
    return true;
  }

  try {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  } catch (e) {
    console.error("Error al solicitar permiso de notificaciones:", e);
    return false;
  }
}

// Disparar notificación push nativa del navegador
export function sendProximityNotification(alert: NearbyAlert): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  const categoryLabels: Record<string, string> = {
    medical: "Médico",
    rescue: "Rescate",
    fire: "Incendio",
    general: "SOS General"
  };

  const title = `⚠️ SOS Cercano - ${categoryLabels[alert.category] || "Emergencia"}`;
  const body = `A ${Math.round(alert.distanceMeters)}m hacia el ${alert.directionText} - ${alert.description}`;

  // Intenta hacer vibrar el dispositivo si se soporta
  if ('vibrate' in navigator) {
    try {
      navigator.vibrate([200, 100, 200, 100, 200]);
    } catch (e) {
      // Ignorar fallos de gesto o soporte
    }
  }

  // Si existe service worker registrado, intentar mostrar notificación a través de él para que funcione mejor en background
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then((registration) => {
      registration.showNotification(title, {
        body,
        icon: '/redsos-icon.png', // Fallback si no existe
        badge: '/redsos-icon.png',
        vibrate: [200, 100, 200, 100, 200],
        tag: alert.id,
        requireInteraction: true,
        data: { alertId: alert.id, lat: alert.lat, lng: alert.lng }
      } as any);
    }).catch(() => {
      // Fallback a notificación clásica de ventana
      new Notification(title, { body });
    });
  } else {
    // Notificación clásica de ventana
    new Notification(title, { body });
  }
}

// Verificar si el usuario ya marcó que está "yendo a ayudar"
export async function markAsHelping(
  alertId: string,
  userId: string,
  userName: string
): Promise<void> {
  // Primero subir a Firebase Firestore
  await markUserAsHelper(alertId, userId, userName);

  // Registrar localmente a través de llamada API a la red SOS si hay conexión
  try {
    await fetch(`${API_URL}/api/alerts/${alertId}/helping`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId, userName }),
    });
  } catch (err) {
    console.warn("Fallo registro en KV Worker local (modo offline):", err);
  }
}

// Obtener cuántas personas están yendo a ayudar a una alerta
export async function getHelpersCount(alertId: string): Promise<number> {
  // 1. Intentar desde Firebase Firestore
  try {
    const count = await countHelpers(alertId);
    if (count > 0) return count;
  } catch (err) {
    console.warn("Error leyendo de Firebase, intentando Worker...");
  }

  // 2. Fallback a la API local del Worker
  try {
    const res = await fetch(`${API_URL}/api/alerts/${alertId}/helpers`);
    if (res.ok) {
      const data = await res.json();
      return data.helpers ? data.helpers.length : 0;
    }
  } catch (err) {
    console.warn("Error consultando helpers en Worker:", err);
  }

  return 0;
}
