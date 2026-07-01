import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  getDocs, 
  onSnapshot, 
  query, 
  orderBy, 
  limit, 
  doc, 
  setDoc,
  serverTimestamp,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from "firebase/firestore";
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User 
} from "firebase/auth";

// Read configuration values safely (hardcoded real redsos-venezuela config)
const firebaseConfig = {
  apiKey: "AIzaSyADuvJV3WOgczDUfaSv8PEZyvlZ_WX1erI",
  authDomain: "redsos-venezuela.firebaseapp.com",
  projectId: "redsos-venezuela",
  storageBucket: "redsos-venezuela.firebasestorage.app",
  messagingSenderId: "116311249348",
  appId: "1:116311249348:web:1bf583b14f66b96d105491",
  measurementId: "G-KG7K9HG9C4"
};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Firestore with robust multi-tab persistent offline cache
// This directly answers the offline-first disaster-recovery requirement of RedSOS!
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

// Initialize Auth and Google Provider with Workspace scopes
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.addScope("https://www.googleapis.com/auth/spreadsheets");
provider.addScope("https://www.googleapis.com/auth/drive.file");

let isSigningIn = false;
let cachedAccessToken: string | null = null;

export { db, auth };

/**
 * Initializes Auth and reports success or failure status.
 */
export const initAuth = (
  onAuthSuccess?: (user: User, token: string | null) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

/**
 * Get current authenticated user
 */
export const getCurrentUser = (): User | null => {
  return auth.currentUser;
};


/**
 * Initiates the interactive popup for Sign In with Google
 */
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error("Failed to get access token from Google Auth");
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error("Sign in error:", error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

/**
 * Gets the current cached OAuth access token
 */
export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

/**
 * Signs the current user out and clears the cached access token
 */
export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};

export const signOut = logout;



/**
 * Publishes a mesh alert packet to Firestore database (Gateway Synchronizer)
 */
export async function uplinkAlertToFirebase(alertData: {
  messageId: number;
  latitude: number;
  longitude: number;
  battery: number;
  ttl: number;
  flags: number;
  type: number;
  hash: number;
  status: string;
  description: string;
}) {
  try {
    const docRef = await addDoc(collection(db, "alerts"), {
      ...alertData,
      timestamp: serverTimestamp(),
      source: "Mesh Gateway Node",
      classification: alertData.flags === 1 ? "Medical" : 
                      alertData.flags === 2 ? "Rescue" :
                      alertData.flags === 4 ? "Fire" : "General SOS"
    });
    console.log(`[Firebase Uplink] Successfully pushed mesh alert to cloud, docId: ${docRef.id}`);
    return docRef.id;
  } catch (error) {
    console.error("[Firebase Uplink] Error uploading packet to Firestore:", error);
    throw error;
  }
}

/**
 * Reports a node's health and role telemetries to the Firestore database
 */
export async function reportNodeStatusToFirebase(nodeData: {
  nodeId: string;
  role: string;
  battery: number;
  lastLatitude: number;
  lastLongitude: number;
  trustScore: number;
}) {
  try {
    const nodeDocRef = doc(db, "nodes", nodeData.nodeId);
    await setDoc(nodeDocRef, {
      ...nodeData,
      lastSeen: serverTimestamp()
    }, { merge: true });
    console.log(`[Firebase Telemetry] Node status reported for: ${nodeData.nodeId}`);
  } catch (error) {
    console.error("[Firebase Telemetry] Error reporting node state:", error);
  }
}

/**
 * Publishes network-level routing logs for Dijkstra path computations on dashboard
 */
export async function pushRoutingTelemetryToFirebase(telemetryData: {
  messageId: number;
  hopCount: number;
  gatewayNodeId: string;
  rssi: number;
}) {
  try {
    await addDoc(collection(db, "telemetry"), {
      ...telemetryData,
      timestamp: serverTimestamp()
    });
    console.log(`[Firebase Telemetry] Dijkstra log generated for MsgID ${telemetryData.messageId}`);
  } catch (error) {
    console.error("[Firebase Telemetry] Error writing Dijkstra routing logs:", error);
  }
}

/**
 * Sets up a real-time Firestore listener for active emergency alerts
 */
export function listenToActiveAlerts(onUpdate: (alerts: any[]) => void) {
  const alertsQuery = query(
    collection(db, "alerts"),
    orderBy("timestamp", "desc"),
    limit(50)
  );

  return onSnapshot(alertsQuery, (snapshot) => {
    const alertsList: any[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      alertsList.push({
        id: doc.id,
        ...data,
        // Fallback for timestamp conversion
        created_at: data.timestamp?.toDate ? data.timestamp.toDate().toISOString() : new Date().toISOString()
      });
    });
    onUpdate(alertsList);
  }, (error) => {
    console.error("[Firebase Realtime] Error reading alerts stream:", error);
  });
}

/**
 * Marca a un usuario como "ayudando" a una alerta específica
 */
export async function markUserAsHelper(
  alertId: string,
  userId: string,
  userName: string
) {
  try {
    const helperRef = doc(db, "alerts", alertId, "helpers", userId);
    await setDoc(helperRef, {
      userId,
      userName,
      markedAt: serverTimestamp()
    });
    console.log(`[Firebase] Usuario ${userName} marcado como ayudante de ${alertId}`);
  } catch (error) {
    console.error("[Firebase] Error marcando ayudante:", error);
  }
}

/**
 * Cuenta cuántas personas están ayudando a una alerta
 */
export async function countHelpers(alertId: string): Promise<number> {
  try {
    const helpersSnapshot = await getDocs(collection(db, "alerts", alertId, "helpers"));
    return helpersSnapshot.size;
  } catch (error) {
    console.error("[Firebase] Error contando ayudantes:", error);
    return 0;
  }
}

/**
 * Listener en tiempo real para todas las alertas activas con sus coordenadas
 * (versión optimizada para cálculo de proximidad en el cliente)
 */
export function listenToAllActiveAlertsForProximity(
  onUpdate: (alerts: any[]) => void
) {
  const activeAlertsQuery = query(
    collection(db, "alerts"),
    orderBy("timestamp", "desc"),
    limit(100)
  );

  return onSnapshot(activeAlertsQuery, (snapshot) => {
    const alerts: any[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.status !== 'resolved') {
        alerts.push({ id: docSnap.id, ...data });
      }
    });
    onUpdate(alerts);
  });
}

/**
 * Crea una alerta de emergencia directa de usuario en Firestore
 */
export async function createDirectSOSInFirestore(alertData: {
  id: string;
  user_name: string;
  latitude: number;
  longitude: number;
  battery_level: number;
  connection_type: string;
  status: string;
  description: string;
  userId?: string;
}) {
  try {
    const docRef = doc(db, "alerts", alertData.id);
    await setDoc(docRef, {
      id: alertData.id,
      user_name: alertData.user_name,
      latitude: alertData.latitude,
      longitude: alertData.longitude,
      battery_level: alertData.battery_level,
      connection_type: alertData.connection_type,
      status: alertData.status,
      description: alertData.description,
      userId: alertData.userId || "",
      timestamp: serverTimestamp(),
      source: alertData.user_name || "Civil",
      classification: "General SOS"
    });
    console.log(`[Firebase SOS] Alerta directa registrada en Firestore: ${alertData.id}`);
    return alertData.id;
  } catch (error) {
    console.error("[Firebase SOS] Error registrando alerta en Firestore:", error);
    throw error;
  }
}


