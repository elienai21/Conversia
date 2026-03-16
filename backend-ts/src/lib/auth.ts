import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "../config.js";

export interface TokenPayload {
  sub: string;
  tenant_id: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function createAccessToken(
  userId: string,
  tenantId: string,
): string {
  const payload: TokenPayload = { sub: userId, tenant_id: tenantId };
  return jwt.sign(payload, config.SECRET_KEY, {
    expiresIn: `${config.ACCESS_TOKEN_EXPIRE_MINUTES}m`,
  });
}

export function decodeAccessToken(token: string): TokenPayload {
  return jwt.verify(token, config.SECRET_KEY) as TokenPayload;
}
