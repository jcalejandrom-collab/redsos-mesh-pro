import { haversineDistance } from './ProximityAlertService';

export interface NavigationTarget {
  lat: number;
  lng: number;
  label?: string;
}

// Abrir Google Maps con ruta desde ubicación actual hasta el destino
// Detecta automáticamente si es móvil o desktop
export function openGoogleMapsRoute(
  origin: { lat: number; lng: number } | null,
  destination: NavigationTarget,
  travelMode: 'walking' | 'driving' | 'bicycling' = 'driving'
): void {
  const url = getMapsUrl(origin, destination, travelMode);
  
  // Abrir la URL en una pestaña nueva o app nativa
  window.open(url, '_blank');
}

// Detectar plataforma para usar el esquema de URL correcto
function getMapsUrl(
  origin: { lat: number; lng: number } | null,
  destination: NavigationTarget,
  travelMode: string
): string {
  const dLat = destination.lat;
  const dLng = destination.lng;
  
  // Parámetro de modo de transporte de Google Maps API de enlaces
  // driving: 'd', walking: 'w', bicycling: 'b'
  const modeChar = travelMode === 'walking' ? 'w' : travelMode === 'bicycling' ? 'b' : 'd';
  
  // Detectar agente de usuario para ver si es iOS o Android
  const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera || '';
  const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream;
  const isAndroid = /android/i.test(userAgent);

  if (isIOS) {
    // Si es iOS, intentar comgooglemaps:// para app de Google Maps
    // Fallback simple a maps.apple.com para que iOS decida o maps web
    if (origin) {
      return `https://maps.apple.com/?saddr=${origin.lat},${origin.lng}&daddr=${dLat},${dLng}&dirflg=${modeChar === 'w' ? 'w' : 'd'}`;
    } else {
      return `https://maps.apple.com/?daddr=${dLat},${dLng}&dirflg=${modeChar === 'w' ? 'w' : 'd'}`;
    }
  }

  if (isAndroid) {
    // Android geo URI
    if (origin) {
      return `google.navigation:q=${dLat},${dLng}&mode=${modeChar === 'w' ? 'w' : 'd'}`;
    } else {
      return `geo:0,0?q=${dLat},${dLng}(${encodeURIComponent(destination.label || 'SOS Emergencia')})`;
    }
  }

  // Desktop / Web estándar
  if (origin) {
    return `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${dLat},${dLng}&travelmode=${travelMode}`;
  } else {
    return `https://www.google.com/maps/search/?api=1&query=${dLat},${dLng}`;
  }
}

// Función específica para Capacitor (app nativa)
export async function openNativeNavigation(
  destination: NavigationTarget,
  travelMode: 'walking' | 'driving' = 'driving'
): Promise<void> {
  try {
    // Intentar abrir mediante el plugin de Capacitor App, o simplemente lanzar el enlace de geolocalización.
    // Como las aplicaciones nativas manejan enlaces del sistema de forma automática, lanzar la geo URI o google.navigation
    // suele abrir directamente la app nativa de mapas del dispositivo.
    const userAgent = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(userAgent);
    
    let url = '';
    const modeChar = travelMode === 'walking' ? 'w' : 'd';
    
    if (isIOS) {
      url = `maps://maps.apple.com/?daddr=${destination.lat},${destination.lng}&dirflg=${modeChar}`;
    } else {
      url = `google.navigation:q=${destination.lat},${destination.lng}&mode=${modeChar}`;
    }

    window.location.href = url;
  } catch (e) {
    console.warn("[NavigationService] Error en navegación nativa, usando fallback web:", e);
    openGoogleMapsRoute(null, destination, travelMode);
  }
}

// Calcular tiempo estimado de llegada basado en distancia y modo de viaje
// walking: 5 km/h (1.38 m/s)
// bicycling: 15 km/h (4.16 m/s)
// driving: 30 km/h (8.33 m/s) (considerando tráfico urbano local de Barquisimeto)
export function estimateETA(
  distanceMeters: number,
  travelMode: 'walking' | 'driving' | 'bicycling'
): { minutes: number; displayText: string } {
  let speed = 1.38; // por defecto walking (m/s)
  let modeText = "caminando";

  if (travelMode === 'bicycling') {
    speed = 4.16;
    modeText = "en bicicleta";
  } else if (travelMode === 'driving') {
    speed = 8.33;
    modeText = "en vehículo";
  }

  const seconds = distanceMeters / speed;
  const minutes = Math.max(1, Math.round(seconds / 60));

  return {
    minutes,
    displayText: `${minutes} min ${modeText}`
  };
}

// Generar el texto descriptivo de distancia y dirección para mostrar al usuario
export function getNavigationSummary(
  origin: { lat: number; lng: number },
  destination: NavigationTarget
): {
  distanceText: string; // "450m" o "1.2km"
  etaWalking: string;   // "6 min caminando"
  etaDriving: string;   // "2 min en vehículo"
} {
  const distance = haversineDistance(origin.lat, origin.lng, destination.lat, destination.lng);

  let distanceText = `${Math.round(distance)}m`;
  if (distance >= 1000) {
    distanceText = `${(distance / 1000).toFixed(1)}km`;
  }

  const walking = estimateETA(distance, 'walking');
  const driving = estimateETA(distance, 'driving');

  return {
    distanceText,
    etaWalking: walking.displayText,
    etaDriving: driving.displayText
  };
}
