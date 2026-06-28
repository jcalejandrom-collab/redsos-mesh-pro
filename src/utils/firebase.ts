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

// Read configuration values safely (fallback to defaults if file is not loaded)
const firebaseConfig = {
  apiKey: "AIzaSyCmVL7oWm1m1gyNz8lF1GbeTIf4stQ8hh0",
  authDomain: "ornate-pen-05jvd.firebaseapp.com",
  projectId: "ornate-pen-05jvd",
  storageBucket: "ornate-pen-05jvd.firebasestorage.app",
  messagingSenderId: "420338609826",
  appId: "1:420338609826:web:07a2f018737e284ee1f1fb"
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

export { db };

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
