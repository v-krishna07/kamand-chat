import dns from 'node:dns/promises';
import net from 'node:net';
import type { LinkPreviewDTO } from '@kamand/shared';

/**
 * SSRF-Safe Server-Side Link Preview Fetcher (Section 5 & Section 14)
 * - Blocks private, loopback, link-local, metadata (`169.254.169.254`), and internal IPv4/IPv6 addresses.
 * - Blocks `localhost`, `.local`, `.internal` hostnames.
 * - Caps HTTP redirects to at most 2 hops and validates every hop against SSRF rules.
 * - Extracts `<title>` and `og:description` using safe regex + entity decoding (zero XSS).
 */

export function isPrivateOrReservedIp(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) {
    const parts = ip.split('.').map((n) => parseInt(n, 10));
    const [a, b] = parts;
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 cloud metadata / link-local
    if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b !== undefined && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a !== undefined && a >= 224) return true; // Multicast / reserved
    return false;
  }

  if (version === 6) {
    const normalized = ip.toLowerCase();
    if (normalized === '::1' || normalized === '::') return true;
    if (normalized.startsWith('fe80:')) return true; // Link-local
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // Unique local fc00::/7
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

  if (net.isIP(hostname) !== 0) {
    if (isPrivateOrReservedIp(hostname)) {
      return {
        safe: false,
        reason: `Blocked private or reserved IP address (${hostname})`,
      };
    }
    return { safe: true, parsedUrl: parsed };
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
  } catch {
    return { safe: false, reason: 'DNS resolution failed for URL' };
  }

  return { safe: true, parsedUrl: parsed };
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
    if (!validation.safe || !validation.parsedUrl) {
      throw new Error(validation.reason || 'URL blocked by SSRF filter');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);

    try {
      const res = await fetch(validation.parsedUrl.toString(), {
        method: 'GET',
        redirect: 'manual',
        headers: {
          'User-Agent': 'KamandChat-LinkPreview/1.0',
          Accept: 'text/html,application/xhtml+xml',
        },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.status >= 300 && res.status < 400) {
        if (hop === maxRedirects) {
          throw new Error('Maximum redirect limit (2) exceeded');
        }
        const location = res.headers.get('location');
        if (!location) {
          throw new Error('Redirect missing Location header');
        }
        currentUrl = new URL(location, validation.parsedUrl).toString();
        continue;
      }

      if (!res.ok) {
        throw new Error(`Upstream returned HTTP ${res.status}`);
      }

      const html = (await res.text()).slice(0, 64_000);
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
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error('Unable to fetch link preview');
}
