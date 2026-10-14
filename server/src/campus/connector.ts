import { config } from '../config.js';
import type { CampusConnectorHealth, CampusHealthSummary } from '@kamand/shared';

/**
 * Base Campus Connector Interface (Section 13)
 * Supports probe() for health checks and "Try, Then Degrade" graceful fallbacks.
 */
export interface CampusConnector {
  readonly id: string;
  readonly name: string;
  probe(): Promise<CampusConnectorHealth>;
}

class CampusConnectorRegistry {
  private connectors = new Map<string, CampusConnector>();

  public register(connector: CampusConnector): void {
    this.connectors.set(connector.id, connector);
  }

  public get(id: string): CampusConnector | undefined {
    return this.connectors.get(id);
  }

  public getAll(): CampusConnector[] {
    return Array.from(this.connectors.values());
  }

  public async getHealthSummary(): Promise<CampusHealthSummary> {
    const results = await Promise.all(
      this.getAll().map(async (c) => {
        try {
          return await c.probe();
        } catch (err) {
          return {
            id: c.id,
            name: c.name,
            isHealthy: false,
            latencyMs: 0,
            lastChecked: new Date().toISOString(),
            fallbackActive: true,
            message: err instanceof Error ? err.message : 'Probe failure',
          };
        }
      })
    );

    const anyUnhealthy = results.some((r) => !r.isHealthy);
    const allUnhealthy = results.length > 0 && results.every((r) => !r.isHealthy);

    return {
      overallStatus: allUnhealthy ? 'offline' : anyUnhealthy ? 'degraded' : 'healthy',
      connectors: results,
      timestamp: new Date().toISOString(),
    };
  }
}

export const campusRegistry = new CampusConnectorRegistry();

/**
 * "Try, Then Degrade" Wrapper:
 * Attempts the primary operation with a strict timeout. If it errors or times out,
 * seamlessly executes the fallback operation without crashing or returning an error to the user.
 */
export async function tryThenDegrade<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
  timeoutMs = config.campusProbeTimeoutMs
): Promise<{ data: T; fallbackActive: boolean; error?: string }> {
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs);
    });

    const data = await Promise.race([primary(), timeoutPromise]);
    return { data, fallbackActive: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Primary source unreachable';
    try {
      const fallbackData = await fallback();
      return { data: fallbackData, fallbackActive: true, error: message };
    } catch (fallbackErr) {
      throw new Error(`Both primary and fallback failed: ${message}`);
    }
  }
}
