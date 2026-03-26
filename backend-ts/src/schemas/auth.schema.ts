import { z } from "zod";

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const googleLoginRequestSchema = z.object({
  credential: z.string().min(1),
});

export const passwordResetRequestSchema = z.object({
  email: z.string().email(),
});

export const refreshTokenRequestSchema = z.object({
  refresh_token: z.string().min(1),
});

export const signupRequestSchema = z.object({
  company_name: z.string().min(2).max(100),
  full_name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  terms_accepted: z.literal(true, {
    errorMap: () => ({ message: "Você deve aceitar os Termos de Uso e a Política de Privacidade." }),
  }),
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1),
  new_password: z.string().min(8).max(128),
});

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    tenantId: string;
  };
}
