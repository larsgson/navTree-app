import type { CapacitorConfig } from '@capacitor/cli';
import appConfig from './app.config.json';

const config: CapacitorConfig = {
  appId: appConfig.appId,
  appName: appConfig.appName,
  webDir: 'dist',
  server: {
    androidScheme: 'http',
    cleartext: true,
  },
  android: {
    webContentsDebuggingEnabled: true,
  },
};

export default config;
