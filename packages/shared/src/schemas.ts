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

export const usernameSchema = z
    .string()
    .trim()
    .toLowerCase()
    .regex(
        /^[a-z0-9_-]{3,30}$/,
        'Username must be 3-30 characters: letters, numbers, underscores or hyphens'
    );

export const registerSchema = z.object({
    username: usernameSchema,
    email: emailSchema,
    password: passwordSchema
});
// Login deliberately does not enforce password rules: they could leak policy and add nothing.
export const loginSchema = z.object({
    username: usernameSchema,
    password: z.string().min(1).max(256)
});

const nameField = z
    .string()
    .trim()
    // Collapse inner whitespace and refuse control characters; empty means "not set"
    .transform((s) => s.replace(/\s+/g, ' '))
    .pipe(z.string().max(50, 'Keep names to 50 characters or fewer'))
    .refine((s) => !/[\p{Cc}\p{Cf}]/u.test(s), 'Names can not contain control characters')
    .transform((s) => (s === '' ? null : s));

export const accountProfileSchema = z.object({
    firstName: nameField,
    lastName: nameField,
    showRealName: z.boolean()
});
export type AccountProfileInput = z.infer<typeof accountProfileSchema>;

/** "Ada Lovelace", "Ada" or "Lovelace"; null when neither is set. */
export const fullName = (u: { firstName: string | null; lastName: string | null }) =>
    [u.firstName, u.lastName].filter(Boolean).join(' ') || null;

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export interface UserDto {
    id: number;
    username: string;
    email: string;
    /** When the uploaded avatar last changed (ms); null = none, show the generated identicon */
    avatarUpdatedAt: number | null;
    /** Optional real name, private to the user unless `showRealName` is on */
    firstName: string | null;
    lastName: string | null;
    /** Whether the real name is shown on the public profile */
    showRealName: boolean;
}
export interface ApiError {
    error: string;
    details?: unknown;
}

export const DEFAULT_SLOT_NAMES = ['Main', 'Secondary', 'Palate cleanser'] as const;
