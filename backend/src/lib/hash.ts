import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { config } from '../config.js';

const secret = new TextEncoder().encode(config.jwtSecret);

export const hashPassword = (password: string) => {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
};

export const verifyPassword = (password: string, storedHash: string) => {
  const [salt, key] = storedHash.split(':');
  if (!salt || !key) return false;
  const derivedKey = scryptSync(password, salt, 64);
  return timingSafeEqual(derivedKey, Buffer.from(key, 'hex'));
};

export const createToken = async (userId: string, role: string) => {
  return new SignJWT({ role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(secret);
};

export const readToken = async (token: string): Promise<{ sub: string; role?: string } | undefined> => {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    if (!payload.sub) return undefined;
    return { sub: payload.sub, role: typeof payload.role === 'string' ? payload.role : undefined };
  } catch {
    return undefined;
  }
};
