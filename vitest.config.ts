import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      'react-native': 'react-native-web',
      'expo-secure-store': path.resolve(__dirname, 'src/test-utils/mockSecureStore.ts'),
      'expo-sqlite': path.resolve(__dirname, 'src/test-utils/mockSqlite.ts'),
      'expo-linking': path.resolve(__dirname, 'src/test-utils/mockLinking.ts'),
    },
  },
});
