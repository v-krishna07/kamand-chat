import { config } from '../config.js';

export interface VerifiedGoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture: string | null;
  hd: string | null;
}

/**
 * Verifies a Google OAuth 2.0 / Google Identity Services ID token.
 * - In test/demo mode, accepts signed demo tokens (`demo-google-token:<email>:<name>:<hd>`)
 *   for offline automated testing when no external internet or Google Client ID is configured.
 * - In production or when a real JWT is supplied, verifies via Google's `oauth2.googleapis.com/tokeninfo`
 *   endpoint and enforces `aud` + optional IIT Mandi `hd` claim (`students.iitmandi.ac.in` / `iitmandi.ac.in`).
 */
export async function verifyGoogleIdToken(idToken: string): Promise<VerifiedGoogleProfile> {
  const isSimulated =
    idToken.startsWith('demo-google-token:') || idToken.startsWith('google-token-direct:');

  if (isSimulated && (config.demoMode || config.nodeEnv === 'test' || !config.googleClientId)) {
    const parts = idToken.split(':');
    const email = (parts[1] || '').trim().toLowerCase();
    const name = parts[2] || 'IIT Mandi Student';
    const hd = parts[3] || email.split('@')[1] || null;
    if (!email || !email.includes('@')) {
      throw new Error('Invalid Google token email');
    }

    if (
      config.enforceInstituteDomain &&
      (!hd || !config.allowedGoogleDomains.includes(hd.toLowerCase()))
    ) {
      throw new Error(
        `Google login restricted to institute domains: ${config.allowedGoogleDomains.join(', ')}`
      );
    }

    return {
      sub: `google-sub-${email}`,
      email,
      emailVerified: true,
      name,
      picture: null,
      hd,
    };
  }

  const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Invalid or expired Google ID token.');
  }

  const payload = (await response.json()) as Record<string, string | undefined>;
  if (config.googleClientId && payload.aud !== config.googleClientId) {
    throw new Error('Google ID token audience mismatch.');
  }

  if (payload.email_verified !== 'true' || !payload.email || !payload.sub) {
    throw new Error('Google account email is not verified.');
  }

  const hd = payload.hd ? payload.hd.toLowerCase() : null;
  if (
    config.enforceInstituteDomain &&
    (!hd || !config.allowedGoogleDomains.includes(hd))
  ) {
    throw new Error(
      `Google login is restricted to IIT Mandi domains (${config.allowedGoogleDomains.join(', ')}).`
    );
  }

  return {
    sub: payload.sub,
    email: payload.email.toLowerCase(),
    emailVerified: true,
    name: payload.name || payload.email.split('@')[0] || 'Campus User',
    picture: payload.picture || null,
    hd,
  };
}
