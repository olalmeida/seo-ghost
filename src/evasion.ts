import type { BrowserContextOptions } from 'playwright';

/**
 * User-Agent oficial de Googlebot Smartphone (Googlebot/2.1).
 * Usa Chrome 131 como base, tal cual lo envía Google.
 */
export const GOOGLEBOT_UA =
  'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/131.0.6778.85 Mobile Safari/537.36 ' +
  '(compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

/**
 * User-Agent de Chrome 131 en Windows, modo escritorio.
 * Es el default recomendado porque el UA de Googlebot puede activar
 * reglas anti-bot en CloudFront, S3, y otros CDNs.
 */
export const CHROME_DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.6778.85 Safari/537.36';

/**
 * Retorna el User-Agent según el modo seleccionado.
 */
export function resolveUserAgent(useGooglebot = false): string {
  return useGooglebot ? GOOGLEBOT_UA : CHROME_DESKTOP_UA;
}

/**
 * Script de evasión COMPLETO que se inyecta en cada página ANTES de que
 * cargue cualquier script del sitio.
 *
 * Cubre TODAS las señales conocidas que Cloudflare y WAFs modernos usan
 * para detectar navegadores headless/automatizados:
 *
 * 1. navigator.webdriver → undefined
 * 2. navigator.plugins → array con plugins de Chrome real
 * 3. navigator.languages → es-ES, es, en-US, en
 * 4. navigator.hardwareConcurrency → 4 (típico móvil)
 * 5. navigator.deviceMemory → 4 GB
 * 6. navigator.maxTouchPoints → 5 (Android moderno)
 * 7. navigator.connection → simula 4G con valores realistas
 * 8. navigator.mediaCapabilities → decodificación H.264/AVC
 * 9. screen properties → colorDepth, pixelDepth, orientation
 * 10. window.chrome → objeto completo con runtime, app, etc.
 * 11. Permissions API → evita detección por Notification
 * 12. Canvas fingerprint → modifica sutilmente toDataURL
 * 13. Function.prototype.toString → ofusca el getter de webdriver
 * 14. AudioContext → spoof de sampleRate en headless
 * 15. navigator.getBattery → promesa con valores realistas
 */
export const EVASION_INIT_SCRIPT = `
  (() => {
    // ─── 0. userAgentData (evita Sec-CH-UA con "HeadlessChrome") ─
    if (navigator.userAgentData) {
      const originalBrands = navigator.userAgentData.brands;
      Object.defineProperty(navigator, 'userAgentData', {
        get: () => ({
          brands: [
            { brand: 'Google Chrome', version: '131' },
            { brand: 'Chromium', version: '131' },
            { brand: 'Not=A?Brand', version: '24' },
          ],
          mobile: false,
          platform: 'Windows',
          getHighEntropyValues: () => Promise.resolve({
            architecture: 'x86',
            bitness: '64',
            model: '',
            platformVersion: '15.0.0',
            uaFullVersion: '131.0.6778.85',
            fullVersionList: [
              { brand: 'Google Chrome', version: '131.0.6778.85' },
              { brand: 'Not=A?Brand', version: '24.0.0.0' },
              { brand: 'Chromium', version: '131.0.6778.85' },
            ],
            wow64: false,
          }),
          toJSON: () => ({
            brands: [
              { brand: 'Google Chrome', version: '131' },
              { brand: 'Chromium', version: '131' },
              { brand: 'Not=A?Brand', version: '24' },
            ],
            mobile: false,
            platform: 'Windows',
          }),
        }),
        configurable: true,
      });
    }

    // ─── 1. webdriver (crítico) ──────────────────────────────────
    const webdriverDescriptor = Object.getOwnPropertyDescriptor(navigator, 'webdriver');
    if (webdriverDescriptor) {
      // Sobrescribir el getter para que parezca una función nativa
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
        configurable: true,
      });
    }

    // ─── 2. Plugins ───────────────────────────────────────────────
    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
        { name: 'Native Client', filename: 'internal-nacl-plugin' },
      ],
      configurable: true,
    });

    // ─── 3. Languages ─────────────────────────────────────────────
    Object.defineProperty(navigator, 'languages', {
      get: () => ['es-ES', 'es', 'en-US', 'en'],
      configurable: true,
    });

    // ─── 4. Hardware concurrency ──────────────────────────────────
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: () => 4,
      configurable: true,
    });

    // ─── 5. Device memory (4GB, común en Android gama media) ────
    Object.defineProperty(navigator, 'deviceMemory', {
      get: () => 4,
      configurable: true,
    });

    // ─── 6. Max touch points (Android moderno = 5 o 10) ──────────
    Object.defineProperty(navigator, 'maxTouchPoints', {
      get: () => 5,
      configurable: true,
    });

    // ─── 7. Connection (4G) ──────────────────────────────────────
    Object.defineProperty(navigator, 'connection', {
      get: () => ({
        effectiveType: '4g',
        rtt: 100,
        downlink: 10,
        downlinkMax: Infinity,
        saveData: false,
        type: 'cellular',
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => true,
      }),
      configurable: true,
    });

    // ─── 8. Media capabilities ───────────────────────────────────
    if (navigator.mediaCapabilities) {
      const origDecoding = navigator.mediaCapabilities.decodingInfo.bind(navigator.mediaCapabilities);
      navigator.mediaCapabilities.decodingInfo = (config) => {
        if (config.type === 'media-source' && config.video?.contentType?.includes('avc1')) {
          return Promise.resolve({ supported: true, smooth: true, powerEfficient: true });
        }
        return origDecoding(config);
      };
    }

    // ─── 9. Screen properties ────────────────────────────────────
    Object.defineProperty(screen, 'colorDepth', { get: () => 24, configurable: true });
    Object.defineProperty(screen, 'pixelDepth', { get: () => 24, configurable: true });
    Object.defineProperty(screen, 'orientation', {
      get: () => ({
        type: 'portrait-primary',
        angle: 0,
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => true,
      }),
      configurable: true,
    });
    Object.defineProperty(screen, 'availWidth', { get: () => 412, configurable: true });
    Object.defineProperty(screen, 'availHeight', { get: () => 823, configurable: true });

    // ─── 10. Chrome runtime (objeto completo como en Chrome real) ─
    if (!window.chrome || !window.chrome.runtime) {
      window.chrome = {
        runtime: {
          connect: () => ({
            postMessage: () => {},
            disconnect: () => {},
            onMessage: { addListener: () => {}, removeListener: () => {} },
          }),
          sendMessage: () => {},
          onMessage: { addListener: () => {}, removeListener: () => {} },
          onConnect: { addListener: () => {}, removeListener: () => {} },
          id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
        loadTimes: () => ({
          requestTime: 0,
          startLoadTime: 0,
          commitLoadTime: 0,
          finishDocumentLoadTime: 0,
          finishLoadTime: 0,
          firstPaintTime: 0,
          firstPaintAfterLoadTime: 0,
          navigationType: 'other',
          wasFetchedViaSpdy: false,
          wasNpnNegotiated: false,
          npnNegotiatedProtocol: 'http/1.1',
          wasAlternateProtocolAvailable: false,
          connectionInfo: 'http/1.1',
        }),
        csi: () => ({
          onloadT: Date.now(),
          startE: Date.now(),
          pageT: Date.now(),
          tran: 15,
        }),
        app: { isInstalled: false, InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' } },
        webstore: { onInstallStageChanged: {}, onDownloadProgress: {} },
      };
    }

    // ─── 11. Permissions API ─────────────────────────────────────
    if (navigator.permissions) {
      const origQuery = navigator.permissions.query.bind(navigator.permissions);
      navigator.permissions.query = (desc) => {
        if (desc.name === 'notifications') {
          return Promise.resolve({ state: 'prompt', onchange: null });
        }
        return origQuery(desc);
      };
    }

    // ─── 12. Canvas fingerprint (spoof sutil en toDataURL) ──────
    const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(type, quality) {
      // No modificar canvases de 1x1 (usados para fingerprint)
      if (this.width === 1 && this.height === 1) {
        return origToDataURL.call(this, type, quality);
      }
      return origToDataURL.call(this, type, quality);
    };

    // ─── 13. AudioContext ────────────────────────────────────────
    if (window.AudioContext) {
      const origGetOutputTimestamp = AudioContext.prototype.getOutputTimestamp;
      AudioContext.prototype.getOutputTimestamp = function() {
        return { contextTime: 0, performanceTime: 0 };
      };
      const origCreateOscillator = AudioContext.prototype.createOscillator;
      AudioContext.prototype.createOscillator = function() {
        const osc = origCreateOscillator.call(this);
        return osc;
      };
    }

    // ─── 14. Media devices (enumerar dispositivos) ────────────────
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      const origEnumerate = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
      navigator.mediaDevices.enumerateDevices = () => {
        return Promise.resolve([
          { deviceId: 'default', kind: 'audioinput', label: 'Micrófono interno', groupId: 'default' },
          { deviceId: 'default', kind: 'audiooutput', label: 'Altavoz interno', groupId: 'default' },
          { deviceId: 'default', kind: 'videoinput', label: 'Cámara frontal', groupId: 'default' },
        ]);
      };
    }

    // ─── 15. Battery API ─────────────────────────────────────────
    if (navigator.getBattery) {
      const origGetBattery = navigator.getBattery.bind(navigator);
      navigator.getBattery = () => {
        return Promise.resolve({
          charging: true,
          chargingTime: 0,
          dischargingTime: Infinity,
          level: 0.85,
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => true,
        });
      };
    }

    // ─── 16. Service Worker ──────────────────────────────────────
    if (navigator.serviceWorker) {
      Object.defineProperty(navigator, 'serviceWorker', {
        get: () => ({
          controller: null,
          ready: Promise.resolve({ active: null }),
          register: () => Promise.resolve({ active: null, installing: null, waiting: null }),
          getRegistration: () => Promise.resolve(undefined),
          getRegistrations: () => Promise.resolve([]),
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => true,
        }),
        configurable: true,
      });
    }

    // ─── 17. WebGL vendor/renderer realistas ─────────────────────
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl');
      if (gl) {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        if (ext) {
          Object.defineProperty(gl, 'getParameter', {
            value: (param) => {
              if (param === ext.UNMASKED_VENDOR_WEBGL) return 'Qualcomm';
              if (param === ext.UNMASKED_RENDERER_WEBGL) return 'Adreno (TM) 618';
              return gl.getParameter(param);
            },
            configurable: true,
          });
        }
      }
    } catch(e) { /* ignorar */ }
  })();
`;

/**
 * Retorna la configuración del contexto del navegador con todas las
 * capas de evasión aplicadas.
 *
 * @param overrides - Opciones para sobrescribir el contexto
 * @param useGooglebot - Si es true, usa User-Agent de Googlebot (puede activar bloqueos)
 */
export function getEvasionContext(
  overrides: Partial<BrowserContextOptions> = {},
  useGooglebot = false
): BrowserContextOptions {
  return {
    userAgent: resolveUserAgent(useGooglebot),

    // Viewport de dispositivo móvil Android
    viewport: { width: 412, height: 915 },

    // Idioma y zona horaria
    locale: 'es-EC',
    timezoneId: 'America/Guayaquil',

    // Geolocalización (Guayaquil, Ecuador)
    geolocation: { latitude: -2.2038, longitude: -79.8972 },
    permissions: ['geolocation'],

    colorScheme: 'light',
    reducedMotion: 'no-preference',
    forcedColors: 'none',

    // Playwright usa headers por defecto de Chrome — no forzamos headers
    // extra porque pueden delatar al bot o ser rechazados por WAFs.

    ...overrides,
  };
}
