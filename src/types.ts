export type NodeRole = 'operator' | 'brigadist' | 'user' | 'shelter' | 'repeater';

export interface MeshNode {
  id: string;
  name: string;
  signal: number; // in dBm, e.g. -45 is great, -90 is weak
  battery: number; // percentage
  role: NodeRole;
  lat: number;
  lng: number;
  isOnline: boolean;
}

export interface EmergencyAlert {
  id: string;
  user_name: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
  speed?: number;
  battery_level: number;
  connection_type: 'internet' | 'mesh_bluetooth' | 'mesh_wifi' | 'hybrid';
  status: 'active' | 'attending' | 'resolved';
  description: string;
  audio_url: string | null;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  sender_name: string;
  content: string;
  type: 'text' | 'location' | 'audio' | 'image';
  uuid: string;
  ttl: number;
  hops: number;
  hash_sha256: string;
  is_synced: boolean;
  created_at: string;
}

export interface PacketLog {
  id: string;
  timestamp: string;
  type: 'TX' | 'RX' | 'DROP' | 'HOP';
  sender: string;
  receiver: string;
  messageId: string;
  ttl: number;
  hops: number;
  sizeBytes: number;
  protocol: 'BLE' | 'WiFi_Direct' | 'CentralServer';
  details: string;
}

export interface BrigadeMember {
  id: string;
  name: string;
  role: 'Leader' | 'S&R' | 'Medical' | 'Logistics';
  battery: number;
  status: 'active' | 'standby' | 'resting';
  task: string;
}

export interface BrigadeTeam {
  id: string;
  name: string;
  leader: string;
  members: BrigadeMember[];
  assignedArea: string;
  activeMission: string;
}
