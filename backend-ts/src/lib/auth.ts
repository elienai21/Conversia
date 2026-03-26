import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "../config.js";

export interface TokenPayload {
  sub: string;
  tenant_id: string;
}

export interface PasswordResetTokenPayload extends TokenPayload {
  purpose: "password_reset";
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

export function createPasswordResetToken(
  userId: string,
  tenantId: string,
): string {
  const payload: PasswordResetTokenPayload = {
    sub: userId,
    tenant_id: tenantId,
    purpose: "password_reset",
  };

  return jwt.sign(payload, config.SECRET_KEY, {
    expiresIn: `${config.PASSWORD_RESET_EXPIRE_MINUTES}m`,
  });
}

export function decodePasswordResetToken(token: string): PasswordResetTokenPayload {
  return jwt.verify(token, config.SECRET_KEY) as PasswordResetTokenPayload;
}

export interface RefreshTokenPayload extends TokenPayload {
  purpose: "refresh";
}

export function createRefreshToken(userId: string, tenantId: string): string {
  const payload: RefreshTokenPayload = { sub: userId, tenant_id: tenantId, purpose: "refresh" };
  return jwt.sign(payload, config.SECRET_KEY, {
    expiresIn: `${config.REFRESH_TOKEN_EXPIRE_DAYS}d`,
  });
}

export function decodeRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, config.SECRET_KEY) as RefreshTokenPayload;
  if (decoded.purpose !== "refresh") {
    throw new Error("Invalid token purpose");
  }
  return decoded;
}

export interface EmailVerificationTokenPayload extends TokenPayload {
  purpose: "email_verification";
}

/** Creates a signed JWT to verify an email address. Expires in 24 hours. */
export function createEmailVerificationToken(userId: string, tenantId: string): string {
  const payload: EmailVerificationTokenPayload = {
    sub: userId,
    tenant_id: tenantId,
    purpose: "email_verification",
  };
  return jwt.sign(payload, config.SECRET_KEY, { expiresIn: "24h" });
}

export function decodeEmailVerificationToken(token: string): EmailVerificationTokenPayload {
  const decoded = jwt.verify(token, config.SECRET_KEY) as EmailVerificationTokenPayload;
  if (decoded.purpose !== "email_verification") {
    throw new Error("Invalid token purpose");
  }
  return decoded;
}
