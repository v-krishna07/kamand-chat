import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import type { LinkPreviewDTO } from '@kamand/shared';

export function isPrivateOrReservedIp(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) {
    const parts = ip.split('.').map((n) => parseInt(n, 10));
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b !== undefined && b >= 64 && b <= 127) return true;
    if (a !== undefined && a >= 224) return true;
    return false;
  }

  if (version === 6) {
    const normalized = ip.toLowerCase();
    if (normalized === '::1' || normalized === '::') return true;
    if (normalized.startsWith('fe80:')) return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    if (normalized.startsWith('::ffff:')) {
      const mappedIpv4 = normalized.slice('::ffff:'.length);
      if (net.isIP(mappedIpv4) === 4) {
        return isPrivateOrReservedIp(mappedIpv4);
      }
    }
    return false;
  }

  return true;
}

export async function validateUrlAgainstSsrf(rawUrl: string): Promise<{
  safe: boolean;
  parsedUrl?: URL;
  pinnedIp?: string;
  family?: 4 | 6;
  reason?: string;
}> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { safe: false, reason: 'Invalid URL format' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: false, reason: 'Only http:// and https:// URLs are allowed' };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    return { safe: false, reason: 'Blocked internal/localhost hostname (SSRF protection)' };
  }

  const ipVersion = net.isIP(hostname);
  if (ipVersion !== 0) {
    if (isPrivateOrReservedIp(hostname)) {
      return {
        safe: false,
        reason: `Blocked private or reserved IP address (${hostname})`,
      };
    }
    return {
      safe: true,
      parsedUrl: parsed,
      pinnedIp: hostname,
      family: ipVersion as 4 | 6,
    };
  }

  try {
    const records = await dns.lookup(hostname, { all: true });
    if (records.length === 0) {
      return { safe: false, reason: 'Unable to resolve hostname' };
    }
    for (const rec of records) {
      if (isPrivateOrReservedIp(rec.address)) {
        return {
          safe: false,
          reason: `Hostname resolved to blocked private IP (${rec.address})`,
        };
      }
    }
    const first = records[0]!;
    return {
      safe: true,
      parsedUrl: parsed,
      pinnedIp: first.address,
      family: (first.family === 6 ? 6 : 4) as 4 | 6,
    };
  } catch {
    return { safe: false, reason: 'DNS resolution failed for URL' };
  }
}

function requestPinnedUrl(
  parsedUrl: URL,
  pinnedIp: string,
  family: 4 | 6,
  timeoutMs = 3500
): Promise<{ statusCode: number; location?: string; body: string }> {
  return new Promise((resolve, reject) => {
    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? https : http;

    const req = client.request(
      parsedUrl,
      {
        method: 'GET',
        timeout: timeoutMs,
        headers: {
          Host: parsedUrl.host,
          'User-Agent': 'KamandChat-LinkPreview/1.0',
          Accept: 'text/html,application/xhtml+xml',
        },
        lookup: (_hostname, _opts, cb) => {
          cb(null, pinnedIp, family);
        },
      },
      (res) => {
        const statusCode = res.statusCode ?? 500;
        const location = res.headers.location;
        const chunks: Buffer[] = [];
        let totalBytes = 0;

        res.on('data', (chunk: Buffer) => {
          totalBytes += chunk.length;
          if (totalBytes <= 64_000) {
            chunks.push(chunk);
          } else {
            req.destroy();
          }
        });

        res.on('end', () => {
          resolve({
            statusCode,
            location,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('Link preview request timed out'));
    });

    req.on('error', (err) => reject(err));
    req.end();
  });
}

function sanitizePlainText(raw: string, maxLen = 200): string {
  return raw
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

export async function fetchSafeLinkPreview(targetUrl: string): Promise<LinkPreviewDTO> {
  const maxRedirects = 2;
  let currentUrl = targetUrl;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const validation = await validateUrlAgainstSsrf(currentUrl);
    if (!validation.safe || !validation.parsedUrl || !validation.pinnedIp) {
      throw new Error(validation.reason || 'URL blocked by SSRF filter');
    }

    const res = await requestPinnedUrl(
      validation.parsedUrl,
      validation.pinnedIp,
      validation.family ?? 4
    );

    if (res.statusCode >= 300 && res.statusCode < 400) {
      if (hop === maxRedirects) {
        throw new Error('Maximum redirect limit (2) exceeded');
      }
      if (!res.location) {
        throw new Error('Redirect missing Location header');
      }
      currentUrl = new URL(res.location, validation.parsedUrl).toString();
      continue;
    }

    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new Error(`Upstream returned HTTP ${res.statusCode}`);
    }

    const html = res.body;
    const titleMatch =
      html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const descMatch =
      html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);

    return {
      url: validation.parsedUrl.toString(),
      title: sanitizePlainText(titleMatch?.[1] || validation.parsedUrl.hostname, 120),
      description: sanitizePlainText(
        descMatch?.[1] || `Shared link from ${validation.parsedUrl.hostname}`,
        220
      ),
      siteName: validation.parsedUrl.hostname,
    };
  }

  throw new Error('Unable to fetch link preview');
}
