/**
 * RedSOS - Google Chat DevOps Integrations Service
 * Standard Service complying strictly with Priority Queue Filters and Stateful Circuit Breakers.
 */

export interface AlertPayload {
  id: string;
  nodeId: string;
  description: string;
  batteryLevel: number;
  lat: number;
  lng: number;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  timestamp: string;
}

// Circuit Breaker state variables
let cbState: 'CLOSED' | 'OPEN' = 'CLOSED';
let requestCount = 0;
let lastReset = Date.now();
let totalSuppressed = 0;

const CB_LIMIT = 3;        // max requests in window
const CB_WINDOW = 10000;   // 10 seconds window
const CB_COOLDOWN = 30000; // 30 seconds cooldown when tripped

/**
 * Checks and updates the internal Circuit Breaker status
 */
function updateCircuitBreaker() {
  const now = Date.now();

  // If in OPEN state and cooldown period has expired, reset to CLOSED
  if (cbState === 'OPEN' && now - lastReset >= CB_COOLDOWN) {
    cbState = 'CLOSED';
    requestCount = 0;
    lastReset = now;
  }

  // If in CLOSED state and rate-limiting window has expired, reset counter window
  if (cbState === 'CLOSED' && now - lastReset >= CB_WINDOW) {
    requestCount = 0;
    lastReset = now;
  }
}

/**
 * Returns current statistics of the Circuit Breaker
 */
export function getCircuitBreakerStatus(): {
  state: 'OPEN' | 'CLOSED';
  requestCount: number;
  nextResetIn: number;
  suppressedCount: number;
} {
  updateCircuitBreaker();
  const now = Date.now();
  let nextResetIn = 0;

  if (cbState === 'OPEN') {
    nextResetIn = Math.max(0, Math.ceil((lastReset + CB_COOLDOWN - now) / 1000));
  } else {
    nextResetIn = Math.max(0, Math.ceil((lastReset + CB_WINDOW - now) / 1000));
  }

  return {
    state: cbState,
    requestCount,
    nextResetIn,
    suppressedCount: totalSuppressed,
  };
}

/**
 * Manually reset/rearm the Circuit Breaker
 */
export function resetCircuitBreaker() {
  cbState = 'CLOSED';
  requestCount = 0;
  totalSuppressed = 0;
  lastReset = Date.now();
}

/**
 * Dispatch critical Rich Card V2 alerts to IAGAMI Tech team Space
 */
export async function sendCriticalAlert(
  alert: AlertPayload,
  webhookUrl: string
): Promise<{ sent: boolean; reason?: string }> {
  
  // 1. Filter Check: Only CRITICAL priority triggers Google Chat
  if (alert.priority !== 'CRITICAL') {
    return { sent: false, reason: 'PRIORITY_NOT_CRITICAL' };
  }

  // Check if Webhook is empty
  if (!webhookUrl || !webhookUrl.trim()) {
    return { sent: false, reason: 'WEBHOOK_NOT_CONFIGURED' };
  }

  // 2. Evaluate Circuit Breaker Status
  updateCircuitBreaker();

  if (cbState === 'OPEN') {
    totalSuppressed++;
    return { sent: false, reason: 'CIRCUIT_OPEN' };
  }

  // Track rate limit
  requestCount++;
  if (requestCount > CB_LIMIT) {
    cbState = 'OPEN';
    lastReset = Date.now();
    totalSuppressed++;
    return { sent: false, reason: 'CIRCUIT_TRIPPED_TO_OPEN' };
  }

  // 3. Build Google Chat Rich Card V2 Payload
  const cardPayload = {
    cardsV2: [{
      cardId: alert.id,
      card: {
        header: {
          title: '🚨 ALERTA CRÍTICA RedSOS',
          subtitle: alert.nodeId,
          imageUrl: 'https://fonts.gstatic.com/s/i/productlogos/chat/v4/web-64.png',
          imageType: 'CIRCLE'
        },
        sections: [{
          widgets: [
            { textParagraph: { text: alert.description } },
            { decoratedText: { topLabel: 'Batería', text: `${alert.batteryLevel}%` } },
            { decoratedText: { topLabel: 'Coordenadas', text: `${alert.lat}, ${alert.lng}` } },
            {
              buttonList: {
                buttons: [{
                  text: 'Ver en Google Maps',
                  onClick: {
                    openLink: {
                      url: `https://maps.google.com/?q=${alert.lat},${alert.lng}`
                    }
                  }
                }]
              }
            }
          ]
        }]
      }
    }]
  };

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(cardPayload),
    });

    if (!res.ok) {
      throw new Error(`Google Chat API status error: ${res.status} ${res.statusText}`);
    }

    return { sent: true };
  } catch (err: any) {
    return { sent: false, reason: err.message || 'DISPATCH_ERROR' };
  }
}
