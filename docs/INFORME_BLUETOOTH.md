# 🛰️ INFORME DE VIABILIDAD Y REQUERIMIENTOS DE INTEGRACIÓN BLUETOOTH (RedSOS)
## Documentación Técnica de Nivel de Producción / Ingeniería IEEE para RedSOS Mesh

Este informe técnico establece los requisitos prácticos, arquitectónicos y físicos indispensables para que el sistema **RedSOS** funcione al **100% de su capacidad** utilizando comunicaciones por **Bluetooth Low Energy (BLE)** de forma descentralizada, tanto en **navegadores web (Web Bluetooth API)** como en **dispositivos móviles nativos (Capacitor/React Native/iOS/Android)**.

---

## 1. Arquitectura General de Comunicación BLE Mesh (DTN)

El sistema RedSOS implementa una arquitectura de comunicación basada en **Delay Tolerant Networking (DTN)** u *Oportunista*, especialmente diseñada para escenarios de catástrofe sin conectividad de infraestructura de red convencional (telefonía móvil, fibra o satélite).

### Flujo Físico y Lógico del Mensaje
```
 [ Dispositivo Emisor ] (Firma SOS localmente)
         ↓ BLE Advertisement (Broadcast de Corto Alcance: ~15m a 80m)
 [ Nodo Ciudadano / Brigadista ] (Filtra duplicados, decrementa TTL, re-difunde)
         ↓ BLE Advertisement retransmitido
 [ Nodo Puente / Gateway ] (Dispositivo en altura con conectividad parcial o satélite)
         ↓ API REST / HTTPS / Supabase Client
 [ Centro de Mando RedSOS ] (Dashboard Web de Monitoreo Global y Despacho)
```

En lugar de crear rutas fijas estáticas (lo cual es inviable debido al movimiento constante de los ciudadanos), el sistema opera como un **mesh por inundación probabilística controlada (Store-and-Forward)**.

---

## 2. Requerimientos para la Versión Web (Web Bluetooth API)

La especificación **Web Bluetooth** es un estándar moderno que permite a las aplicaciones web comunicarse directamente con dispositivos BLE a través del navegador. Sin embargo, impone fuertes restricciones de seguridad para proteger la privacidad del usuario.

### 2.1 Requisitos de Entorno y Seguridad
1. **Seguridad Obligatoria (HTTPS)**: El navegador exige estrictamente que el sitio web se sirva bajo una conexión TLS segura (`https://`). La única excepción permitida durante el desarrollo es `localhost`.
2. **Interacción Explícita del Usuario**: Por políticas contra el rastreo, la API de Bluetooth web **solo** puede llamarse como resultado directo de una acción del usuario (por ejemplo, al presionar un botón de "Escanear" o "Conectar"). No se permite el inicio de escaneos de forma automatizada al cargar la página.
3. **Restricción de Segundo Plano (Background)**: Una pestaña del navegador que pierda el foco o esté minimizada tiene prohibido realizar escaneos activos o mantener flujos BLE en segundo plano.

### 2.2 Compatibilidad de Navegadores
* **Soportado plenamente**: Google Chrome, Microsoft Edge, Opera (en sistemas de escritorio macOS, Windows, Linux, ChromeOS y Android).
* **No soportado**: Apple Safari (en macOS e iOS) no tiene intenciones de implementar Web Bluetooth nativo por motivos de privacidad. Para funcionar en iPhones, es **indispensable** contar con la App Móvil.

### 2.3 Ejemplo de Conexión BLE en Navegador Web (JavaScript/TypeScript)
```typescript
async function escanearYConectarNodo() {
  try {
    console.log("Iniciando solicitud de dispositivo BLE...");
    // El navegador abrirá una ventana nativa segura para que el usuario elija el nodo
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: 'RedSOS_Node' }],
      optionalServices: ['battery_service', '0000ffe0-0000-1000-8000-00805f9b34fb'] 
    });

    const server = await device.gatt?.connect();
    console.log(`Conexión exitosa al Nodo RedSOS: ${device.name}`);
    
    // Escuchar notificaciones de paquetes SOS
    const service = await server?.getPrimaryService('0000ffe0-0000-1000-8000-00805f9b34fb');
    const characteristic = await service?.getCharacteristic('0000ffe1-0000-1000-8000-00805f9b34fb');
    
    await characteristic?.startNotifications();
    characteristic?.addEventListener('characteristicvaluechanged', (event: any) => {
      const buffer = event.target.value.buffer;
      console.log("Paquete binario RedSOS recibido:", buffer);
    });

  } catch (error) {
    console.error("Error al interactuar con Web Bluetooth API:", error);
  }
}
```

---

## 3. Requerimientos para la Aplicación Móvil (Android & iOS)

Para que la red funcione de verdad de manera pasiva y automática (en el bolsillo del ciudadano), la solución móvil nativa es indispensable. La arquitectura ideal para un desarrollo rápido y escalable es una aplicación híbrida usando **Capacitor** o **React Native**.

### 3.1 Requisitos de Ejecución en Segundo Plano (Background Runtime)
Este es el requerimiento más crítico para que la app sea viable en una situación real de emergencia:

* **Android (Altamente Abierto)**:
  * Requiere iniciar un **Foreground Service** con una notificación persistente visible para el usuario. Esto evita que el sistema operativo mate el proceso de la app para ahorrar batería.
  * Permite escaneos continuos de paquetes de publicidad BLE (Bluetooth Low Energy Advertisement scanning) y re-publicidad activa incluso si la pantalla del teléfono está apagada.
* **iOS (Restricciones Estrictas de Apple)**:
  * Requiere declarar la capacidad `bluetooth-central` y `bluetooth-peripheral` en el archivo `Info.plist`.
  * iOS limita el escaneo en segundo plano eliminando los nombres de los dispositivos de la trama publicitaria y reduciendo el ciclo de trabajo (duty cycle) drásticamente. iOS solo procesará anuncios que coincidan estrictamente con un Service UUID registrado específico.

### 3.2 Permisos Requeridos en Dispositivos

#### Configuración de Permisos para Android (`AndroidManifest.xml`):
```xml
<!-- Permisos de Bluetooth Básicos y de Escaneo / Conexión en Android 12+ -->
<uses-permission android:name="android.permission.BLUETOOTH" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" 
                 android:usesPermissionFlags="neverForLocation" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.BLUETOOTH_ADVERTISE" />

<!-- Ubicación de alta precisión (obligatoria para mapear dispositivos BLE de forma cercana) -->
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
```

#### Configuración de Permisos para iOS (`Info.plist`):
```xml
<key>NSBluetoothAlwaysUsageDescription</key>
<string>RedSOS requiere acceso continuo a Bluetooth para detectar y retransmitir alertas críticas de emergencia entre teléfonos cercanos de forma completamente offline.</string>
<key>NSBluetoothPeripheralUsageDescription</key>
<string>RedSOS necesita actuar como periférico Bluetooth para poder emitir tus alertas de SOS a otros rescatistas en el área.</string>
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>RedSOS requiere tu ubicación GPS para adjuntarla a tus paquetes de ayuda y guiar a las brigadas de emergencia.</string>
```

---

## 4. Protocolo de Mensajería BLE de Producción (Payload de 22 Bytes)

En el protocolo de publicidad BLE estándar (Advertising Data), el espacio de datos útiles (Payload) libre de cabeceras es extremadamente compacto, habitualmente restringido a un máximo de **28–31 bytes** en BLE 4.0/4.2.

Para garantizar que los mensajes entren en un solo paquete publicitario (evitando la sobrecarga y el consumo energético de establecer conexiones GATT bilaterales), RedSOS utiliza un **empaquetamiento binario optimizado de 22 bytes en punto fijo (Int32 scaled)**.

### Estructura de Campo Física del Paquete RedSOS
| Campo | Tipo | Tamaño (Bytes) | Rango de Valores | Descripción |
| :--- | :--- | :--- | :--- | :--- |
| **Type** | Uint8 | 1 | `0 - 255` | `0`: Alerta SOS Crítica, `1`: ACK, `2`: Telemetría |
| **Message ID** | Uint16 | 2 | `0 - 65,535` | Identificador único de mensaje para evitar duplicados |
| **Latitude** | Int32 | 4 | `[-90.0M, 90.0M]` | Latitud multiplicada por `1,000,000` (6 decimales de precisión GIS) |
| **Longitude** | Int32 | 4 | `[-180.0M, 180.0M]` | Longitud multiplicada por `1,000,000` (6 decimales de precisión GIS) |
| **Battery** | Uint8 | 1 | `0 - 100` | Nivel de batería del emisor original |
| **TTL** | Uint8 | 1 | `0 - 15` | Saltos máximos permitidos en la malla antes de descartarse |
| **Flags** | Uint8 | 1 | `Bitmask` | Bit 0: Médico, Bit 1: Escombros, Bit 2: Fuego, Bit 3: Brigadista |
| **Hash Truncado**| Uint32 | 4 | `0 - 4.29B` | Checksum derivado para validar integridad física del paquete |
| **Reserved** | Uint32 | 4 | `0 - 4.29B` | Canal reservado para futuras expansiones de datos tácticos |

### Algoritmo de Codificación en Punto Fijo (Fixed-Point Encoding)
No se deben usar tipos decimales flotantes estándar (Float32 o Float64) directamente en tramas binarias compactas IoT porque la representación IEEE-754 introduce imprecisiones de redondeo y consume más almacenamiento del requerido.
* **Fórmula de codificación**: `Valor Entero = Redondear(Coordenada Decimal * 1,000,000)`
* **Fórmula de decodificación**: `Coordenada Decimal = Valor Entero / 1,000,000`
* **Precisión obtenida**: Con 6 decimales de precisión, la resolución espacial en el ecuador es de **11 centímetros**, lo cual es idóneo para búsquedas y salvamento militar o de protección civil.

---

## 5. Algoritmo de Enrutamiento Mesh en el Dispositivo (Mesh Engine)

Cada dispositivo móvil que ejecuta la app móvil de RedSOS actúa como un router inteligente de baja potencia. El flujo lógico de cada nodo es el siguiente:

```
Al recibir una Alerta BLE por Escaneo:
 ├── 1. ¿El MessageID ya existe en la lista de vistos recientemente (Búfer circular)?
 │     ├── SÍ: DESCARTAR (Previene tormentas de retransmisión redundante)
 │     └── NO: Continuar
 ├── 2. ¿El Hash Truncado de integridad es válido con respecto al cuerpo del mensaje?
 │     ├── NO: DESCARTAR (El paquete se corrompió durante la transmisión aérea)
 │     └── SÍ: Guardar MessageID en la lista de vistos e incorporar al historial local
 ├── 3. Decrementar TTL (Time To Live = TTL - 1)
 ├── 4. ¿El TTL resultante es igual a 0?
 │     ├── SÍ: DESCARTAR (Excedió el radio táctico de saltos de emergencia)
 │     └── NO: Continuar
 └── 5. ¿El dispositivo cuenta con Conexión a Internet activa (WiFi/4G)?
       ├── SÍ (Nodo actúa como Gateway): Subir alerta directamente al Backend Central (Supabase)
       └── NO: Iniciar Re-broadcast (Anuncio BLE activo) del paquete modificado para los nodos vecinos
```

---

## 6. Dijkstra Táctico en el Backend del Centro de Mando

Dado que los dispositivos móviles individuales operan de forma offline y oportunista, **no calculan algoritmos globales como Dijkstra en su interior**, ya que requeriría conocer el estado topológico de toda la ciudad en tiempo real (lo cual es físicamente imposible sin internet).

El cálculo de Dijkstra se centraliza en el **Centro de Mando Web (Dashboard Admin)**:
1. Al recibir paquetes de alerta, los nodos puente adjuntan el número de saltos reales (`hops = Original_TTL - Current_TTL`) y el nivel de señal medido (`RSSI`).
2. El servidor central procesa estos históricos y construye un **Grafo de Propagación Probabilística**.
3. El administrador puede visualizar el **Camino de Enrutamiento Dijkstra Estimado** que siguió la señal, permitiéndole identificar qué zonas de la ciudad tienen brigadistas activos sirviendo como repetidores, mapeando zonas de cobertura y cuellos de botella de señal.

---

## 7. Plan de Acción y Despliegue de Producción (NASA Style)

| Fase | Tarea | Herramientas Recomendadas | Resultado Esperado |
| :---: | :--- | :--- | :--- |
| **1** | Implementación del Frontend de Monitoreo | React, Vite, Tailwind, Recharts, Lucide | Interfaz de visualización de incidentes y cálculo Dijkstra en el mapa de Barquisimeto. *(Ya completado)* |
| **2** | Desarrollo de la Aplicación Móvil Híbrida | Ionic Capacitor, Capacitor BLE Plugin, React | APK para Android y compilación para iOS con capacidades de background scanning. |
| **3** | Base de Datos en Tiempo Real de Incidentes | Supabase PostgreSQL con Realtime WebSockets | Alertas SOS disparadas desde nodos se reflejan instantáneamente en el Centro de Mando sin refrescar la página. |
| **4** | Despliegue de Gateways Físicos de Campo | Raspberry Pi 4 / ESP32 con Antenas BLE amplificadas | Unidades autónomas solares que actúan como "puentes" receptores colocados en puntos elevados. |
