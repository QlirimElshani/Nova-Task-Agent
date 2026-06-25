import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Resolve the backend base URL.
 *
 * A device/emulator can't reach the dev machine via "localhost", so we:
 *   1. Honor an explicit EXPO_PUBLIC_API_URL if set (best for real deployments).
 *   2. Use localhost on web.
 *   3. Otherwise derive the dev machine's LAN IP from Expo's hostUri
 *      (e.g. "192.168.1.20:8081") and target port 8000.
 */
const PORT = 8000;

function resolveApiBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit) return explicit.replace(/\/$/, '');

  if (Platform.OS === 'web') return `http://localhost:${PORT}`;

  const legacyHost = (Constants as { manifest?: { debuggerHost?: string } }).manifest
    ?.debuggerHost;
  const hostUri = Constants.expoConfig?.hostUri ?? legacyHost ?? '';
  const host = hostUri.split(':')[0];
  if (host) return `http://${host}:${PORT}`;

  // Last resort.
  return `http://localhost:${PORT}`;
}

export const API_BASE_URL = resolveApiBaseUrl();

// Public API used for the "Daily spark" banner (the task's required public-API fetch).
export const QUOTE_API_URL = 'https://zenquotes.io/api/random';
