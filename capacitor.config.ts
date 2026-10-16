import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ascend.training',
  appName: 'ASCEND',
  webDir: 'public',
  server: {
    url: 'https://ascend-reu004xr0-1shivam3s-projects.vercel.app',
    cleartext: false,
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
