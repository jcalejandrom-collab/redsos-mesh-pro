/**
 * RedSOS Cloudflare Worker
 * Fully replace the Express.js server on Cloudflare Workers Serverless runtime.
 * Implements KV-persistence, CORS, Admin Auth, Rate limiting, and Priority Alert Queuing.
 */

// Ambient types for Cloudflare Worker runtime to pass TypeScript compilation
export interface KVNamespace {
  get(key: string, options?: any): Promise<any>;
  put(key: string, value: string, options?: any): Promise<void>;
}
export interface ExecutionContext {
  waitUntil(promise: Promise<any>): void;
}

export interface Env {
  REDSOS_KV: KVNamespace;
  ADMIN_SECRET_KEY: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
  GOOGLE_PRIVATE_KEY: string;
}

// Helpers for Google OAuth & Sheets Integration (Prompt 5)
function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const byteString = atob(b64);
  const byteArray = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) {
    byteArray[i] = byteString.charCodeAt(i);
  }
  return byteArray.buffer;
}

function base64url(source: ArrayBuffer | string): string {
  let str = "";
  if (typeof source === "string") {
    str = btoa(unescape(encodeURIComponent(source)));
  } else {
    const bytes = new Uint8Array(source);
    for (let i = 0; i < bytes.byteLength; i++) {
      str += String.fromCharCode(bytes[i]);
    }
    str = btoa(str);
  }
  return str.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function validateAdminToken(
  inputToken: string,
  env: Env
): Promise<boolean> {
  const encoder = new TextEncoder();
  const inputBytes = encoder.encode(inputToken);
  const secretBytes = encoder.encode(env.ADMIN_SECRET_KEY || "redsos-government-key-2026");

  // Comparación en tiempo constante — previene ataques de timing
  const inputHash = await crypto.subtle.digest('SHA-256', inputBytes);
  const secretHash = await crypto.subtle.digest('SHA-256', secretBytes);

  const inputArr = new Uint8Array(inputHash);
  const secretArr = new Uint8Array(secretHash);

  let diff = 0;
  for (let i = 0; i < inputArr.length; i++) {
    diff |= inputArr[i] ^ secretArr[i];
  }
  return diff === 0;
}

async function getGoogleAccessToken(env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const headerStr = JSON.stringify({ alg: "RS256", typ: "JWT" });
  const payloadStr = JSON.stringify({
    iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  });

  const encodedHeader = base64url(headerStr);
  const encodedPayload = base64url(payloadStr);
  const jwtDataStr = `${encodedHeader}.${encodedPayload}`;

  let pem = env.GOOGLE_PRIVATE_KEY;
  pem = pem.replace(/\\n/g, "\n");
  const rawKeyB64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");

  const keyBuffer = base64ToArrayBuffer(rawKeyB64);

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBuffer,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: { name: "SHA-256" },
    },
    false,
    ["sign"]
  );

  const dataBuffer = new TextEncoder().encode(jwtDataStr);
  const signatureBuffer = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    dataBuffer
  );

  const encodedSignature = base64url(signatureBuffer);
  const jwtToken = `${jwtDataStr}.${encodedSignature}`;

  const tokenUrl = "https://oauth2.googleapis.com/token";
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwtToken}`,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google Auth error: ${response.status} - ${errText}`);
  }

  const tokenData: any = await response.json();
  return tokenData.access_token;
}

async function writeAlertsToSheet(
  accessToken: string,
  sheetId: string,
  alerts: any[]
): Promise<void> {
  const values = [
    ["ID", "Usuario", "Lat", "Lng", "Descripción", "Estado", "Batería", "Fecha"],
    ...alerts.map((a) => [
      String(a.id || ""),
      String(a.user_name || ""),
      Number(a.latitude || 0),
      Number(a.longitude || 0),
      String(a.description || ""),
      String(a.status || ""),
      Number(a.battery_level || 100),
      String(a.created_at || "")
    ])
  ];
  
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A1:H${values.length}?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ values })
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google Sheets API error: ${response.status} - ${errText}`);
  }
}

// Helper to generate SHA-256 (Web Crypto)
async function generateRealSha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Distance formula
function getDistanceInMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// Dijkstra Route Router
function findOptimalRoute(
  sourceId: string,
  destId: string,
  nodes: any[],
  range: number
): { path: string[]; hops: number; totalDistance: number } | null {
  const onlineNodes = nodes.filter((n) => n.isOnline);
  const nodeMap = new Map(onlineNodes.map((n) => [n.id, n]));

  if (!nodeMap.has(sourceId) || !nodeMap.has(destId)) return null;

  const distances: Record<string, number> = {};
  const previous: Record<string, string | null> = {};
  const queue = new Set<string>();

  for (const n of onlineNodes) {
    distances[n.id] = Infinity;
    previous[n.id] = null;
    queue.add(n.id);
  }

  distances[sourceId] = 0;

  while (queue.size > 0) {
    let u: string | null = null;
    for (const nodeId of queue) {
      if (u === null || distances[nodeId] < distances[u]) {
        u = nodeId;
      }
    }

    if (u === null || distances[u] === Infinity) break;
    if (u === destId) break;

    queue.delete(u);

    const uNode = nodeMap.get(u)!;

    for (const vId of queue) {
      const vNode = nodeMap.get(vId)!;
      const dist = getDistanceInMeters(uNode.lat, uNode.lng, vNode.lat, vNode.lng);

      if (dist <= range) {
        const signalPenalty = Math.abs(vNode.signal) / 100;
        const batteryPenalty = (100 - vNode.battery) / 100;
        const weight = dist * (1 + signalPenalty + batteryPenalty);
        const altWeight = distances[u] + weight;

        if (altWeight < distances[vId]) {
          distances[vId] = altWeight;
          previous[vId] = u;
        }
      }
    }
  }

  if (distances[destId] === Infinity) return null;

  const path: string[] = [];
  let curr: string | null = destId;
  while (curr !== null) {
    path.unshift(nodeMap.get(curr)!.name);
    curr = previous[curr];
  }

  return {
    path,
    hops: path.length - 1,
    totalDistance: Math.round(
      getDistanceInMeters(
        nodeMap.get(sourceId)!.lat,
        nodeMap.get(sourceId)!.lng,
        nodeMap.get(destId)!.lat,
        nodeMap.get(destId)!.lng
      )
    ),
  };
}

// Initial Seed Data Creator
async function ensureSeedData(env: Env) {
  // 1. Seed Nodes
  const nodes = await env.REDSOS_KV.get("nodes");
  if (!nodes) {
    const seedNodes = [
      { id: "node-1", name: "Estación Central El Obelisco", signal: -45, battery: 100, role: "operator", lat: 10.0745, lng: -69.3415, isOnline: true },
      { id: "node-2", name: "Brigada Cardenales (Santa Rosa)", signal: -68, battery: 84, role: "brigadist", lat: 10.0710, lng: -69.2990, isOnline: true },
      { id: "node-3", name: "Refugio Catedral", signal: -55, battery: 95, role: "shelter", lat: 10.0725, lng: -69.3175, isOnline: true },
      { id: "node-4", name: "Repetidor Cabudare", signal: -78, battery: 62, role: "repeater", lat: 10.0700, lng: -69.3250, isOnline: true },
      { id: "node-5", name: "Usuario Aislado (La Estancia)", signal: -92, battery: 45, role: "user", lat: 10.0650, lng: -69.3350, isOnline: false }
    ];
    await env.REDSOS_KV.put("nodes", JSON.stringify(seedNodes));
  }

  // NOTA: no sembramos "alerts" ni "messages" con datos falsos — un array vacío debe
  // significar "sin alertas activas" / "sin mensajes" real, sin víctimas ni chats inventados
  // indistinguibles de datos reales de producción.

  // 4. Seed Global Node Range
  const range = await env.REDSOS_KV.get("globalNodeRange");
  if (!range) {
    await env.REDSOS_KV.put("globalNodeRange", "3000");
  }

  // 5. Seed Failed Packets Log
  const failedPackets = await env.REDSOS_KV.get("failedPacketsLog");
  if (!failedPackets) {
    const seedFailed = [
      { id: "fp-1", sourceNode: "Repetidor Cabudare", destNode: "Usuario Aislado (La Estancia)", timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(), reason: "Señal débil (-92dBm)", lossPercentage: 42, hops: 1 },
      { id: "fp-2", sourceNode: "Refugio Catedral", destNode: "Brigada Cardenales (Santa Rosa)", timestamp: new Date(Date.now() - 3 * 60 * 1000).toISOString(), reason: "Interferencia de canal", lossPercentage: 15, hops: 2 }
    ];
    await env.REDSOS_KV.put("failedPacketsLog", JSON.stringify(seedFailed));
  }
}

// Helpers to read/write states
async function getKVArray<T>(env: Env, key: string): Promise<T[]> {
  const data = await env.REDSOS_KV.get(key);
  return data ? JSON.parse(data) : [];
}

async function saveKVArray<T>(env: Env, key: string, data: T[]): Promise<void> {
  await env.REDSOS_KV.put(key, JSON.stringify(data));
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS Headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-admin-token",
    };

    // Handle OPTIONS Preflight request
    if (method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Rate Limiting by IP
    const clientIp = request.headers.get("CF-Connecting-IP") || "unknown";
    const rateLimitKey = `ratelimit:${clientIp}`;
    const hitsRaw = await env.REDSOS_KV.get(rateLimitKey);
    const hits = parseInt(hitsRaw || "0", 10);

    if (hits >= 5) {
      return new Response(JSON.stringify({ error: "Too Many Requests" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Increment hits with 60 seconds expiration
    await env.REDSOS_KV.put(rateLimitKey, String(hits + 1), { expirationTtl: 60 });

    // Ensure database contains Barquisimeto seed data
    await ensureSeedData(env);

    // Auth Middleware helper (Previene Timing Attacks)
    const checkAdminAuth = async (): Promise<Response | null> => {
      const token = request.headers.get("x-admin-token");
      if (!token) {
        return new Response(JSON.stringify({ error: "Acceso denegado: Falta token" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const isValid = await validateAdminToken(token, env);
      if (!isValid) {
        return new Response(JSON.stringify({ error: "Acceso denegado" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return null;
    };

    try {
      // --- GET /api/health ---
      if (path === "/api/health" && method === "GET") {
        return new Response(JSON.stringify({ status: "ok", runtime: "cloudflare-workers" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // --- GET /api/nodes ---
      if (path === "/api/nodes" && method === "GET") {
        const nodes = await getKVArray<any>(env, "nodes");
        return new Response(JSON.stringify(nodes), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // --- POST /api/nodes ---
      if (path === "/api/nodes" && method === "POST") {
        const authErr = await checkAdminAuth();
        if (authErr) return authErr;

        const body: any = await request.json();
        const nodes = await getKVArray<any>(env, "nodes");

        const newNode = {
          id: `node-${Date.now()}`,
          name: String(body.name || "Nuevo Nodo").substring(0, 100).replace(/[<>]/g, ""),
          signal: Number(body.signal) || -70,
          battery: Number(body.battery) || 100,
          role: String(body.role || "user").substring(0, 30).replace(/[<>]/g, ""),
          lat: Number(body.lat) || 10.0735 + (Math.random() - 0.5) * 0.02,
          lng: Number(body.lng) || -69.3250 + (Math.random() - 0.5) * 0.02,
          isOnline: body.isOnline !== undefined ? Boolean(body.isOnline) : true,
        };

        nodes.push(newNode);
        await saveKVArray(env, "nodes", nodes);

        return new Response(JSON.stringify({ success: true, node: newNode }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // --- DELETE /api/nodes/:id ---
      if (path.startsWith("/api/nodes/") && method === "DELETE") {
        const authErr = await checkAdminAuth();
        if (authErr) return authErr;

        const id = path.split("/").pop();
        const nodes = await getKVArray<any>(env, "nodes");
        const filteredNodes = nodes.filter((n) => n.id !== id);
        await saveKVArray(env, "nodes", filteredNodes);

        return new Response(JSON.stringify({ success: true, message: "Nodo eliminado de la red simulada." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // --- GET /api/alerts ---
      if (path === "/api/alerts" && method === "GET") {
        const alerts = await getKVArray<any>(env, "alerts");
        return new Response(JSON.stringify(alerts), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // --- POST /api/alerts (Priority Queue sorting based on trustScore) ---
      if (path === "/api/alerts" && method === "POST") {
        const body: any = await request.json();
        const alerts = await getKVArray<any>(env, "alerts");

        const safe_user_name = body.user_name ? String(body.user_name).substring(0, 100).replace(/[<>]/g, "") : "Usuario RedSOS";
        const safe_description = body.description ? String(body.description).substring(0, 500).replace(/[<>]/g, "") : "ALERTA SOS DISPARADA";
        const safe_connection_type = body.connection_type ? String(body.connection_type).substring(0, 50).replace(/[<>]/g, "") : "internet";

        const newAlert = {
          id: `alert-${Date.now()}`,
          user_name: safe_user_name,
          latitude: Number(body.latitude) || 10.0735,
          longitude: Number(body.longitude) || -69.3250,
          altitude: Number(body.altitude) || 560,
          accuracy: Number(body.accuracy) || 10.0,
          speed: Number(body.speed) || 0.0,
          battery_level: Number(body.battery_level) || 100,
          connection_type: safe_connection_type,
          status: "active",
          description: safe_description,
          audio_url: body.audio_url || null,
          created_at: new Date().toISOString(),
        };

        // Priority Routing Algorithm:
        // - if trustScore > 0.8: certified brigadists / elite responders -> insert to front of queue
        // - otherwise: general civilian users -> insert at end of queue
        const trustScore = body.trustScore !== undefined ? Number(body.trustScore) : 0.5;
        if (trustScore > 0.8) {
          alerts.unshift(newAlert);
        } else {
          alerts.push(newAlert);
        }

        await saveKVArray(env, "alerts", alerts);

        return new Response(JSON.stringify({ success: true, alert: newAlert, ack: true }), {
          status: 202,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // --- POST /api/alerts/status ---
      if (path === "/api/alerts/status" && method === "POST") {
        const body: any = await request.json();
        const alerts = await getKVArray<any>(env, "alerts");

        const updatedAlerts = alerts.map((a) => (a.id === body.id ? { ...a, status: body.status } : a));
        await saveKVArray(env, "alerts", updatedAlerts);

        const targetAlert = updatedAlerts.find((a) => a.id === body.id);
        return new Response(JSON.stringify({ success: true, alert: targetAlert }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // --- POST /api/alerts/attend ---
      if (path === "/api/alerts/attend" && method === "POST") {
        const authErr = await checkAdminAuth();
        if (authErr) return authErr;

        const body: any = await request.json();
        const { alertId, operatorName } = body;
        const alerts = await getKVArray<any>(env, "alerts");

        const updatedAlerts = alerts.map((a) => (a.id === alertId ? { ...a, status: "attending", operator: operatorName } : a));
        await saveKVArray(env, "alerts", updatedAlerts);

        const targetAlert = updatedAlerts.find((a) => a.id === alertId);
        return new Response(JSON.stringify({ success: true, alert: targetAlert }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // --- POST /api/alerts/resolve ---
      if (path === "/api/alerts/resolve" && method === "POST") {
        const authErr = await checkAdminAuth();
        if (authErr) return authErr;

        const body: any = await request.json();
        const { alertId } = body;
        const alerts = await getKVArray<any>(env, "alerts");

        const updatedAlerts = alerts.map((a) => (a.id === alertId ? { ...a, status: "resolved" } : a));
        await saveKVArray(env, "alerts", updatedAlerts);

        const targetAlert = updatedAlerts.find((a) => a.id === alertId);
        return new Response(JSON.stringify({ success: true, alert: targetAlert }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // --- POST /api/alerts/:id/helping ---
      if (path.startsWith("/api/alerts/") && path.endsWith("/helping") && method === "POST") {
        const parts = path.split("/");
        const alertId = parts[parts.length - 2];
        const body: any = await request.json();
        const { userId, userName } = body;

        const key = `helpers:${alertId}`;
        const existing = await env.REDSOS_KV.get(key);
        const helpers = existing ? JSON.parse(existing) : [];

        if (!helpers.find((h: any) => h.userId === userId)) {
          helpers.push({ userId, userName, markedAt: new Date().toISOString() });
          await env.REDSOS_KV.put(key, JSON.stringify(helpers), { expirationTtl: 86400 });
        }

        return new Response(JSON.stringify({ success: true, helpersCount: helpers.length }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // --- GET /api/alerts/:id/helpers ---
      if (path.startsWith("/api/alerts/") && path.endsWith("/helpers") && method === "GET") {
        const parts = path.split("/");
        const alertId = parts[parts.length - 2];
        const key = `helpers:${alertId}`;
        const data = await env.REDSOS_KV.get(key);
        const helpers = data ? JSON.parse(data) : [];

        return new Response(JSON.stringify({ helpers }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // --- POST /api/brigadistas/register ---
      if (path === "/api/brigadistas/register" && method === "POST") {
        const body: any = await request.json();
        const { deviceId, publicKeyHex, brigada, cedula } = body;

        if (!deviceId || !publicKeyHex || !brigada || !cedula) {
          return new Response(JSON.stringify({ error: "Faltan datos obligatorios para el registro de brigadistas." }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const brigadistas = await getKVArray<any>(env, "brigadistas");
        const newBrigadista = {
          deviceId,
          publicKeyHex,
          brigada: String(brigada).replace(/[<>]/g, ""),
          cedula: String(cedula).replace(/[<>]/g, ""),
          registeredAt: new Date().toISOString()
        };
        brigadistas.push(newBrigadista);
        await saveKVArray(env, "brigadistas", brigadistas);

        return new Response(JSON.stringify({ success: true, brigadista: newBrigadista }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // --- GET /api/messages ---
      if (path === "/api/messages" && method === "GET") {
        const messages = await getKVArray<any>(env, "messages");
        return new Response(JSON.stringify(messages), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // --- POST /api/messages (includes automated AI helper fallback responses) ---
      if (path === "/api/messages" && method === "POST") {
        const body: any = await request.json();
        const messages = await getKVArray<any>(env, "messages");

        const safe_sender_name = body.sender_name ? String(body.sender_name).substring(0, 50).replace(/[<>]/g, "") : "Anónimo";
        const safe_content = body.content ? String(body.content).substring(0, 300).replace(/[<>]/g, "") : "";

        const real_hash = body.hash_sha256 || (await generateRealSha256(safe_content));

        const newMsg = {
          id: `m-${Date.now()}`,
          sender_name: safe_sender_name,
          content: safe_content,
          type: body.type || "text",
          uuid: `mesh-msg-${Date.now()}`,
          ttl: body.ttl !== undefined ? Number(body.ttl) : 5,
          hops: body.hops !== undefined ? Number(body.hops) : 0,
          hash_sha256: real_hash,
          is_synced: body.is_synced !== undefined ? Boolean(body.is_synced) : true,
          created_at: new Date().toISOString(),
        };

        messages.push(newMsg);

        // Auto Advisor trigger for emergency help keywords
        const normalizedContent = safe_content.toLowerCase();
        const hasTriggerWord =
          normalizedContent.includes("ayuda") ||
          normalizedContent.includes("auxilio") ||
          normalizedContent.includes("sos") ||
          normalizedContent.includes("operador") ||
          normalizedContent.includes("protocolo") ||
          normalizedContent.includes("sismo") ||
          normalizedContent.includes("primeros auxilios");

        if (safe_sender_name !== "Asistente Inteligente RedSOS" && hasTriggerWord) {
          const aiResponseText =
            "Alerta captada por la red Mesh local. Mantenga la calma. Acciones recomendadas: 1. Aléjese de postes o estructuras inestables. 2. Active el modo desastre para optimizar batería. 3. Personal de rescate está monitoreando esta zona.";

          const aiMsg = {
            id: `m-ai-${Date.now()}`,
            sender_name: "Asistente Inteligente RedSOS",
            content: aiResponseText,
            type: "text",
            uuid: `mesh-msg-ai-${Date.now()}`,
            ttl: 5,
            hops: 0,
            hash_sha256: await generateRealSha256(aiResponseText),
            is_synced: true,
            created_at: new Date().toISOString(),
          };
          messages.push(aiMsg);
        }

        await saveKVArray(env, "messages", messages);

        return new Response(JSON.stringify({ success: true, message: newMsg }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // --- GET /api/admin/system-health (Requires Admin Auth) ---
      if (path === "/api/admin/system-health" && method === "GET") {
        const authErr = await checkAdminAuth();
        if (authErr) return authErr;

        const nodes = await getKVArray<any>(env, "nodes");
        const alerts = await getKVArray<any>(env, "alerts");
        const failedPacketsLog = await getKVArray<any>(env, "failedPacketsLog");
        const rangeRaw = await env.REDSOS_KV.get("globalNodeRange");
        const globalNodeRange = Number(rangeRaw || "3000");

        // Compute Network Health
        const activeCount = nodes.filter((n) => n.isOnline).length;
        const totalCount = nodes.length;
        const healthPercentage = totalCount > 0 ? Math.round((activeCount / totalCount) * 100) : 0;
        
        const networkHealth = {
          activeNodes: activeCount,
          totalNodes: totalCount,
          percentage: healthPercentage,
          status: activeCount === totalCount ? "Óptimo" : activeCount > totalCount / 2 ? "Degradado" : "Crítico",
        };

        // Compute Battery Metrics
        const totalBattery = nodes.reduce((sum, n) => sum + n.battery, 0);
        const averageBattery = totalCount > 0 ? Math.round(totalBattery / totalCount) : 100;
        const batteryMetrics = {
          average: averageBattery,
          lowest: totalCount > 0 ? Math.min(...nodes.map((n) => n.battery)) : 100,
        };

        // Compute Packet Loss
        const inactiveNodes = totalCount - activeCount;
        const baseLoss = 5;
        const computedLoss = Math.min(95, baseLoss + inactiveNodes * 18 + (activeCount === 0 ? 90 : 0));
        const packetLoss = {
          averageLoss: computedLoss,
          status: computedLoss < 15 ? "Excelente" : computedLoss < 35 ? "Estable" : "Alerta de Desconexión",
        };

        return new Response(
          JSON.stringify({
            networkHealth,
            batteryMetrics,
            packetLoss,
            emergencyAlerts: alerts,
            failedPackets: failedPacketsLog,
            globalNodeRange,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // --- POST /api/admin/dijkstra-route (Requires Admin Auth) ---
      if (path === "/api/admin/dijkstra-route" && method === "POST") {
        const authErr = await checkAdminAuth();
        if (authErr) return authErr;

        const body: any = await request.json();
        const { sourceId, destId } = body;

        if (!sourceId || !destId) {
          return new Response(JSON.stringify({ error: "Debe especificar sourceId y destId" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const nodes = await getKVArray<any>(env, "nodes");
        const rangeRaw = await env.REDSOS_KV.get("globalNodeRange");
        const globalNodeRange = Number(rangeRaw || "3000");

        const route = findOptimalRoute(sourceId, destId, nodes, globalNodeRange);
        if (route) {
          return new Response(JSON.stringify({ success: true, route }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } else {
          return new Response(
            JSON.stringify({
              error: "Ruta de red no viable",
              details:
                "No se pudo calcular una ruta física viable. Asegúrese de que los repetidores intermedios estén encendidos y dentro de la distancia de cobertura de señal (range).",
            }),
            {
              status: 404,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
      }

      // --- POST /api/admin/set-node-range (Requires Admin Auth) ---
      if (path === "/api/admin/set-node-range" && method === "POST") {
        const authErr = await checkAdminAuth();
        if (authErr) return authErr;

        const body: any = await request.json();
        const { range } = body;

        if (range !== undefined && typeof range === "number") {
          await env.REDSOS_KV.put("globalNodeRange", String(range));
          return new Response(JSON.stringify({ success: true, globalNodeRange: range }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } else {
          return new Response(JSON.stringify({ error: "Rango inválido" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // --- POST /api/admin/toggle-node-outage (Requires Admin Auth) ---
      if (path === "/api/admin/toggle-node-outage" && method === "POST") {
        const authErr = await checkAdminAuth();
        if (authErr) return authErr;

        const body: any = await request.json();
        const { id } = body;

        const nodes = await getKVArray<any>(env, "nodes");
        const failedPacketsLog = await getKVArray<any>(env, "failedPacketsLog");

        const nodeIndex = nodes.findIndex((n) => n.id === id);
        if (nodeIndex !== -1) {
          nodes[nodeIndex].isOnline = !nodes[nodeIndex].isOnline;
          const updatedNode = nodes[nodeIndex];

          if (!updatedNode.isOnline) {
            failedPacketsLog.unshift({
              id: `fp-${Date.now()}`,
              sourceNode: updatedNode.name,
              destNode: "Estación Central El Obelisco",
              timestamp: new Date().toISOString(),
              reason: "Simulación de Caída Forzada",
              lossPercentage: 100,
              hops: 0,
            });
            await saveKVArray(env, "failedPacketsLog", failedPacketsLog);
          }

          await saveKVArray(env, "nodes", nodes);

          return new Response(JSON.stringify({ success: true, node: updatedNode }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } else {
          return new Response(JSON.stringify({ error: "Nodo no encontrado" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // --- GET /api/admin/audit-chat (Requires Admin Auth) ---
      // Recalcula el SHA-256 real de cada mensaje y lo compara contra el hash almacenado.
      // No hay registro de claves públicas de firmantes en este esquema de KV, así que la
      // verificación de firma Ed25519 no es posible server-side todavía: se reporta
      // explícitamente como no verificable en vez de inventar un resultado.
      if (path === "/api/admin/audit-chat" && method === "GET") {
        const authErr = await checkAdminAuth();
        if (authErr) return authErr;

        const messages = await getKVArray<any>(env, "messages");
        const auditedMessages = await Promise.all(
          messages.map(async (msg) => {
            const realHash = await generateRealSha256(msg.content || "");
            const shaHashMatched = Boolean(msg.hash_sha256) && realHash === msg.hash_sha256;
            return {
              ...msg,
              recalculatedHash: realHash,
              shaHashMatched,
              signatureVerified: msg.signature ? null : undefined, // sin registro de claves públicas server-side, no verificable
              verifiedIntegrity: shaHashMatched,
            };
          })
        );

        return new Response(JSON.stringify(auditedMessages), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // --- POST /api/admin/export-sheets (Requires Admin Auth) ---
      if (path === "/api/admin/export-sheets" && method === "POST") {
        const authErr = await checkAdminAuth();
        if (authErr) return authErr;

        const body: any = await request.json();
        const { sheetId } = body;

        if (!sheetId) {
          return new Response(JSON.stringify({ error: "Debe especificar sheetId" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const alerts = await getKVArray<any>(env, "alerts");

        try {
          const token = await getGoogleAccessToken(env);
          await writeAlertsToSheet(token, sheetId, alerts);

          return new Response(JSON.stringify({ success: true, rowsWritten: alerts.length }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } catch (err: any) {
          return new Response(JSON.stringify({ error: err.message || "Error al exportar a Google Sheets" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // Endpoint mismatch helper
      return new Response(JSON.stringify({ error: "Endpoint not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message || "Internal Server Error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  },
};
