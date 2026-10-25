import type { AvatarIconChoice } from './avatar-icons.js';
import type { SocialLinks } from './social.js';
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
export const verifyEmailSchema = z.object({ token: z.string().min(1).max(200) });
export const changeEmailSchema = z.object({ email: emailSchema });
export const forgotPasswordSchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z.object({
    token: z.string().min(1).max(200),
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

/** Longest tagline; one line, shown under the name on the public profile. */
export const BIO_MAX = 160;
export const bioSchema = z.object({
    bio: z
        .string()
        .trim()
        // One line: inner whitespace (including newlines) collapses; control characters are refused
        .transform((s) => s.replace(/\s+/g, ' '))
        .pipe(z.string().max(BIO_MAX, `Keep it to ${BIO_MAX} characters or fewer`))
        .refine((s) => !/[\p{Cc}\p{Cf}]/u.test(s), 'The bio can not contain control characters')
        .transform((s) => (s === '' ? null : s))
});
export type BioInput = z.infer<typeof bioSchema>;

/** Whether search engines may index the public profile pages (default off). */
export const searchIndexingSchema = z.object({ searchIndexable: z.boolean() });
export type SearchIndexingInput = z.infer<typeof searchIndexingSchema>;

/** "Ada Lovelace", "Ada" or "Lovelace"; null when neither is set. */
export const fullName = (u: { firstName: string | null; lastName: string | null }) =>
    [u.firstName, u.lastName].filter(Boolean).join(' ') || null;

export const changePasswordSchema = z
    .object({
        // Not held to the password rules: it only has to match what is stored
        currentPassword: z.string().min(1, 'Enter your current password').max(256),
        newPassword: passwordSchema
    })
    .refine((v) => v.newPassword !== v.currentPassword, {
        path: ['newPassword'],
        message: 'Choose a password different from the current one'
    });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** Deleting the account re-checks the password so a stolen session can't wipe it. */
export const deleteAccountSchema = z.object({
    password: z.string().min(1, 'Enter your password').max(256)
});
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

/** Permission levels: `gamer` is the standard user, `admin` also gets the admin area. */
export const USER_ROLES = ['gamer', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export interface UserDto {
    id: number;
    username: string;
    email: string;
    /** Whether the address is confirmed; when email verification is on, an unconfirmed account can't use the app */
    emailVerified: boolean;
    /** Only a UI hint (shows the Admin link); the server checks the role again on every admin request */
    role: UserRole;
    /** When the uploaded avatar last changed (ms); null = none, show the generated identicon */
    avatarUpdatedAt: number | null;
    /** A preset icon avatar; null = none. Never set together with `avatarUpdatedAt` */
    avatarIcon: AvatarIconChoice | null;
    /** Optional real name, private to the user unless `showRealName` is on */
    firstName: string | null;
    lastName: string | null;
    /** Whether the real name is shown on the public profile */
    showRealName: boolean;
    /** One-line tagline, public on the profile; null = none */
    bio: string | null;
    /** Gaming account names; always shown on the public profile once set */
    socialLinks: SocialLinks;
    /** Whether search engines may index the public profile pages; off unless the user opts in */
    searchIndexable: boolean;
    /** Whether the activity feed is shown on the public profile; on unless the user turns it off */
    showActivity: boolean;
}
export interface ApiError {
    error: string;
    details?: unknown;
}

export const DEFAULT_SLOT_NAMES = ['Main', 'Secondary', 'Palate cleanser'] as const;
