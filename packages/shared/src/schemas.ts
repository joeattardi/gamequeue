import { z } from 'zod';

export const emailSchema = z
    .string()
    .trim()
    .toLowerCase()
    .email('Enter a valid email address')
    .max(254);

export const passwordSchema = z
    .string()
    .min(10, 'Password must be at least 10 characters')
    .max(256);

export const registerSchema = z.object({ email: emailSchema, password: passwordSchema });
// Login deliberately does not enforce password rules: they could leak policy and add nothing.
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(256) });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export interface UserDto {
    id: number;
    email: string;
}
export interface ApiError {
    error: string;
    details?: unknown;
}

export const DEFAULT_SLOT_NAMES = ['Main', 'Secondary', 'Palate cleanser'] as const;
