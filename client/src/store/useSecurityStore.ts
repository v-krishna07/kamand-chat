import { create } from 'zustand';
import type { DeviceDTO, SessionDTO } from '@kamand/shared';
import { apiFetch } from '../lib/api.js';
import {
  generateDeviceKeyBundle,
  deriveDirectConversationKey,
  computeSafetyNumber,
  wrapBundleWithPassphrase,
  unwrapBundleWithPassphrase,
  type SerializedDeviceBundle,
} from '../lib/e2ee.js';

const LOCAL_BUNDLE_KEY = 'kamand_e2ee_device_bundle_v1';
const PEER_KEY_HISTORY_KEY = 'kamand_e2ee_peer_keys_v1';

interface SecurityState {
  deviceBundle: SerializedDeviceBundle | null;
  sessions: SessionDTO[];
  peerDevicesByUser: Record<string, DeviceDTO[]>;
  keyChangedWarningsByUser: Record<string, boolean>;
  safetyNumbersByUser: Record<string, string>;
  hasFaceEnrolled: boolean;
  isE2eeReady: boolean;

  ensureDeviceIdentityKeys: () => Promise<SerializedDeviceBundle>;
  loadPeerDevices: (targetUserId: string) => Promise<DeviceDTO[]>;
  getDirectAesKey: (targetUserId: string, conversationId: string) => Promise<CryptoKey | null>;
  loadSessions: () => Promise<void>;
  revokeOtherSessions: () => Promise<number>;
  revokeSession: (sessionId: string) => Promise<void>;
  backupKeysWithPin: (pin: string) => Promise<void>;
  restoreKeysWithPin: (pin: string) => Promise<boolean>;
  loadFaceStatus: () => Promise<void>;
  deleteFaceData: () => Promise<void>;
}

function getKnownPeerKeyMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(PEER_KEY_HISTORY_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function setKnownPeerKey(userId: string, publicKey: string): void {
  try {
    const map = getKnownPeerKeyMap();
    map[userId] = publicKey;
    localStorage.setItem(PEER_KEY_HISTORY_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota errors
  }
}

export const useSecurityStore = create<SecurityState>((set, get) => ({
  deviceBundle: null,
  sessions: [],
  peerDevicesByUser: {},
  keyChangedWarningsByUser: {},
  safetyNumbersByUser: {},
  hasFaceEnrolled: false,
  isE2eeReady: false,

  ensureDeviceIdentityKeys: async () => {
    const existing = get().deviceBundle;
    if (existing) return existing;

    let bundle: SerializedDeviceBundle | null = null;
    try {
      const saved = localStorage.getItem(LOCAL_BUNDLE_KEY);
      if (saved) {
        bundle = JSON.parse(saved) as SerializedDeviceBundle;
      }
    } catch {
      bundle = null;
    }

    if (!bundle) {
      bundle = await generateDeviceKeyBundle();
      try {
        localStorage.setItem(LOCAL_BUNDLE_KEY, JSON.stringify(bundle));
      } catch {
        // Ignore storage error
      }
    }

    await apiFetch('/api/keys/devices', {
      method: 'POST',
      body: JSON.stringify({
        deviceId: bundle.deviceId,
        deviceName: navigator.userAgent.includes('Mac') ? 'MacBook Web Client' : 'Kamand Web Client',
        identityPublicKey: bundle.identityPublicKeyJwk,
        signingPublicKey: bundle.signingPublicKeyJwk,
      }),
    }).catch(() => undefined);

    set({ deviceBundle: bundle, isE2eeReady: true });
    return bundle;
  },

  loadPeerDevices: async (targetUserId) => {
    const bundle = await get().ensureDeviceIdentityKeys();
    const res = await apiFetch<{ devices: DeviceDTO[] }>(`/api/keys/users/${targetUserId}`);
    const latestDevice = res.devices[0];

    let keyChanged = false;
    let safetyNumber = '';

    if (latestDevice) {
      const knownMap = getKnownPeerKeyMap();
      const previouslySeenKey = knownMap[targetUserId];
      if (previouslySeenKey && previouslySeenKey !== latestDevice.identityPublicKey) {
        keyChanged = true;
      }
      setKnownPeerKey(targetUserId, latestDevice.identityPublicKey);
      safetyNumber = await computeSafetyNumber(
        bundle.identityPublicKeyJwk,
        latestDevice.identityPublicKey
      );
    }

    set((prev) => ({
      peerDevicesByUser: { ...prev.peerDevicesByUser, [targetUserId]: res.devices },
      keyChangedWarningsByUser: {
        ...prev.keyChangedWarningsByUser,
        [targetUserId]: keyChanged,
      },
      safetyNumbersByUser: safetyNumber
        ? { ...prev.safetyNumbersByUser, [targetUserId]: safetyNumber }
        : prev.safetyNumbersByUser,
    }));

    return res.devices;
  },

  getDirectAesKey: async (targetUserId, conversationId) => {
    const bundle = await get().ensureDeviceIdentityKeys();
    let peerDevices = get().peerDevicesByUser[targetUserId];
    if (!peerDevices || peerDevices.length === 0) {
      peerDevices = await get().loadPeerDevices(targetUserId);
    }
    const primaryPeerDevice = peerDevices[0];
    if (!primaryPeerDevice) return null;

    return deriveDirectConversationKey(
      bundle.identityPrivateKeyJwk,
      primaryPeerDevice.identityPublicKey,
      conversationId
    );
  },

  loadSessions: async () => {
    const res = await apiFetch<{ sessions: SessionDTO[] }>('/api/auth/sessions');
    set({ sessions: res.sessions });
  },

  revokeOtherSessions: async () => {
    const res = await apiFetch<{ ok: boolean; revokedCount: number }>(
      '/api/auth/sessions/revoke-others',
      { method: 'POST' }
    );
    await get().loadSessions();
    return res.revokedCount;
  },

  revokeSession: async (sessionId) => {
    await apiFetch(`/api/auth/sessions/${sessionId}`, { method: 'DELETE' });
    await get().loadSessions();
  },

  backupKeysWithPin: async (pin) => {
    const bundle = await get().ensureDeviceIdentityKeys();
    const wrapped = await wrapBundleWithPassphrase(bundle, pin);
    await apiFetch('/api/keys/devices', {
      method: 'POST',
      body: JSON.stringify({
        deviceId: bundle.deviceId,
        deviceName: 'Kamand Web Client (Backed Up)',
        identityPublicKey: bundle.identityPublicKeyJwk,
        signingPublicKey: bundle.signingPublicKeyJwk,
        ...wrapped,
      }),
    });
  },

  restoreKeysWithPin: async (pin) => {
    const res = await apiFetch<{
      backup: {
        wrappedPrivateKeyBackup: string;
        backupSalt: string;
        backupIv: string;
      } | null;
    }>('/api/keys/backup/me');
    if (!res.backup) return false;

    const restored = await unwrapBundleWithPassphrase(
      res.backup.wrappedPrivateKeyBackup,
      res.backup.backupSalt,
      res.backup.backupIv,
      pin
    );
    localStorage.setItem(LOCAL_BUNDLE_KEY, JSON.stringify(restored));
    set({ deviceBundle: restored, isE2eeReady: true });
    return true;
  },

  loadFaceStatus: async () => {
    const res = await apiFetch<{ templates: Array<{ id: string }> }>('/api/face/status');
    set({ hasFaceEnrolled: res.templates.length > 0 });
  },

  deleteFaceData: async () => {
    await apiFetch('/api/face', { method: 'DELETE' });
    set({ hasFaceEnrolled: false });
  },
}));
