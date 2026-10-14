import type { ConnectorId, ConnectorHealthDTO } from '@kamand/shared';
import { campusConfig } from './campus.config.js';
import { config } from '../config.js';
import {
  DEMO_MOODLE_COURSES,
  getDemoMoodleDeadlines,
  DEMO_WEATHER_MANDI,
} from './fixtures.js';

/**
 * Campus Connector Interface & "Try, Then Degrade" Health State Machine (Section 12)
 * - Every connector implements `{ id, name, description, cacheTTL, probe(), fetch(), normalize() }`.
 * - If `probe()` fails (network unreachable, timeout, auth blocked, SSO/captcha wall, schema change),
 *   the connector silently disables itself (`uiVisible: false`, `status: 'degraded_hidden'`),
 *   increments `failureCount`, and after 3 failures backs off for 24 hours.
 */

export type SimulatedProbeOutcome =
  | 'pass'
  | 'fail'
  | 'timeout'
  | 'schema_change'
  | 'auth_failure';

export interface CampusConnector<TRaw = unknown, TNormalized = unknown> {
  readonly id: ConnectorId;
  readonly name: string;
  readonly description: string;
  readonly cacheTTL: number; // milliseconds
  probe(options?: { token?: string; simulatedOutcome?: SimulatedProbeOutcome }): Promise<{
    ok: boolean;
    sourceMode: ConnectorHealthDTO['sourceMode'];
    error?: string;
  }>;
  fetch(options?: { token?: string; icsUrl?: string }): Promise<TRaw>;
  normalize(raw: TRaw): TNormalized;
}

interface ConnectorRuntimeState {
  status: ConnectorHealthDTO['status'];
  uiVisible: boolean;
  failureCount: number;
  lastSyncAt: string | null;
  nextRetryAt: string | null;
  lastError: string | null;
  sourceMode: ConnectorHealthDTO['sourceMode'];
}

const runtimeStates = new Map<ConnectorId, ConnectorRuntimeState>();
const testProbeOverrides = new Map<ConnectorId, SimulatedProbeOutcome>();

export function setConnectorProbeOverrideForTesting(
  id: ConnectorId,
  outcome: SimulatedProbeOutcome | null
): void {
  if (outcome === null) {
    testProbeOverrides.delete(id);
  } else {
    testProbeOverrides.set(id, outcome);
  }
}

export function resetAllConnectorStatesForTesting(): void {
  runtimeStates.clear();
  testProbeOverrides.clear();
}

function getOrInitState(id: ConnectorId): ConnectorRuntimeState {
  const existing = runtimeStates.get(id);
  if (existing) return existing;
  const initial: ConnectorRuntimeState = {
    status: 'connected',
    uiVisible: true,
    failureCount: 0,
    lastSyncAt: new Date().toISOString(),
    nextRetryAt: null,
    lastError: null,
    sourceMode: config.demoMode ? 'demo_fixtures' : 'public_cache',
  };
  runtimeStates.set(id, initial);
  return initial;
}

async function evaluateSimulatedOrLiveOutcome(
  id: ConnectorId,
  explicitOutcome?: SimulatedProbeOutcome
): Promise<{ ok: boolean; sourceMode: ConnectorHealthDTO['sourceMode']; error?: string }> {
  const outcome = explicitOutcome ?? testProbeOverrides.get(id);

  if (outcome === 'fail') {
    return { ok: false, sourceMode: 'off', error: 'Endpoint unreachable (ECONNREFUSED)' };
  }
  if (outcome === 'timeout') {
    return {
      ok: false,
      sourceMode: 'off',
      error: `Connector probe timed out after ${campusConfig.probeTimeoutMs}ms`,
    };
  }
  if (outcome === 'schema_change') {
    return {
      ok: false,
      sourceMode: 'off',
      error: 'Upstream response schema changed unexpectedly (missing expected fields)',
    };
  }
  if (outcome === 'auth_failure') {
    return {
      ok: false,
      sourceMode: 'off',
      error: 'Authentication token rejected or blocked by SSO/CAPTCHA wall',
    };
  }
  if (outcome === 'pass') {
    return {
      ok: true,
      sourceMode: config.demoMode ? 'demo_fixtures' : 'official_api',
    };
  }

  // Default behavior: if DEMO_MODE is active, succeed with demo_fixtures / admin_data
  if (config.demoMode) {
    return {
      ok: true,
      sourceMode: id === 'public_institute' ? 'admin_data' : 'demo_fixtures',
    };
  }

  return { ok: false, sourceMode: 'off', error: 'Real URL not configured' };
}

export const moodleLmsConnector: CampusConnector = {
  id: 'moodle_lms',
  name: 'IIT Mandi Moodle LMS',
  description:
    'Official Moodle Web Services API (`core_enrol_get_users_courses`, `mod_assign_get_assignments`, `gradereport_user_get_grade_items`) + ICS calendar fallback.',
  cacheTTL: 15 * 60 * 1000,
  async probe(opts) {
    return evaluateSimulatedOrLiveOutcome('moodle_lms', opts?.simulatedOutcome);
  },
  async fetch() {
    return {
      courses: DEMO_MOODLE_COURSES,
      deadlines: getDemoMoodleDeadlines(),
    };
  },
  normalize(raw: unknown) {
    return raw;
  },
};

export const academicPortalConnector: CampusConnector = {
  id: 'academic_portal',
  name: 'Academic Portal / Timetable Export',
  description:
    'Timetable & slot schedule via official token or local ICS/CSV/manual student entry.',
  cacheTTL: 60 * 60 * 1000,
  async probe(opts) {
    return evaluateSimulatedOrLiveOutcome('academic_portal', opts?.simulatedOutcome);
  },
  async fetch() {
    return { ok: true };
  },
  normalize(raw: unknown) {
    return raw;
  },
};

export const publicInstituteConnector: CampusConnector = {
  id: 'public_institute',
  name: 'Public Campus Directory & Services',
  description:
    'Mess menu (Pine & Oak Mess), Kamand–Mandi bus timings, academic calendar, notices, library hours & helplines.',
  cacheTTL: 30 * 60 * 1000,
  async probe(opts) {
    return evaluateSimulatedOrLiveOutcome('public_institute', opts?.simulatedOutcome);
  },
  async fetch() {
    return { ok: true };
  },
  normalize(raw: unknown) {
    return raw;
  },
};

export const mandiWeatherConnector: CampusConnector = {
  id: 'mandi_weather',
  name: 'Kamand Valley Weather',
  description: 'Live temperature & mountain weather conditions for Kamand, Mandi.',
  cacheTTL: 30 * 60 * 1000,
  async probe(opts) {
    return evaluateSimulatedOrLiveOutcome('mandi_weather', opts?.simulatedOutcome);
  },
  async fetch() {
    return DEMO_WEATHER_MANDI;
  },
  normalize(raw: unknown) {
    return raw;
  },
};

export const ALL_CAMPUS_CONNECTORS: CampusConnector[] = [
  moodleLmsConnector,
  academicPortalConnector,
  publicInstituteConnector,
  mandiWeatherConnector,
];

/**
 * Runs `probe()` on a connector and updates its "Try, Then Degrade" state:
 * - On pass: resets `failureCount = 0`, sets `status = 'connected'`, `uiVisible = true`.
 * - On fail: sets `status = 'degraded_hidden'`, `uiVisible = false` (so the frontend hides the widget cleanly),
 *   increments `failureCount`, and after 3 failures sets a 24-hour cooldown (`nextRetryAt`).
 */
export async function probeConnectorAndRecordHealth(
  id: ConnectorId,
  options?: { token?: string; simulatedOutcome?: SimulatedProbeOutcome; forceRetry?: boolean }
): Promise<ConnectorHealthDTO> {
  const connector = ALL_CAMPUS_CONNECTORS.find((c) => c.id === id);
  if (!connector) {
    throw new Error(`Unknown connector: ${id}`);
  }

  const state = getOrInitState(id);

  // Respect 24h backoff after 3 consecutive failures unless user explicitly clicked "Try again"
  if (
    !options?.forceRetry &&
    state.failureCount >= campusConfig.maxProbeFailures &&
    state.nextRetryAt &&
    new Date(state.nextRetryAt).getTime() > Date.now()
  ) {
    return {
      id,
      name: connector.name,
      description: connector.description,
      ...state,
    };
  }

  const result = await connector.probe(options);

  if (result.ok) {
    state.status = 'connected';
    state.uiVisible = true;
    state.failureCount = 0;
    state.lastSyncAt = new Date().toISOString();
    state.nextRetryAt = null;
    state.lastError = null;
    state.sourceMode = result.sourceMode;
  } else {
    state.failureCount += 1;
    state.status = 'degraded_hidden';
    state.uiVisible = false;
    state.lastError = result.error || 'Connector probe failed';
    state.sourceMode = 'off';
    const backoffMs =
      state.failureCount >= campusConfig.maxProbeFailures
        ? campusConfig.backoffCooldownMs
        : Math.min(300_000, 5_000 * Math.pow(2, state.failureCount));
    state.nextRetryAt = new Date(Date.now() + backoffMs).toISOString();
  }

  runtimeStates.set(id, state);

  return {
    id,
    name: connector.name,
    description: connector.description,
    ...state,
  };
}

export async function getAllConnectorsHealth(): Promise<ConnectorHealthDTO[]> {
  const results: ConnectorHealthDTO[] = [];
  for (const c of ALL_CAMPUS_CONNECTORS) {
    const state = getOrInitState(c.id);
    results.push({
      id: c.id,
      name: c.name,
      description: c.description,
      ...state,
    });
  }
  return results;
}
