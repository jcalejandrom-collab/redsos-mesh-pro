import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 've.gob.iagami.redsos',
  appName: 'RedSOS — IAGAMI Venezuela',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    BluetoothLe: {
      displayStrings: {
        scanning: 'Buscando nodos RedSOS...',
        cancel: 'Cancelar',
        availableDevices: 'Brigadas cercanas',
        noDeviceFound: 'Sin nodos en rango'
      }
    },
    LocalNotifications: {
      smallIcon: 'ic_redsos_notification',
      iconColor: '#ef4444',
    }
  }
};

export default config;
