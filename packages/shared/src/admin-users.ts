import { z } from 'zod';
import {
    accountProfileSchema,
    emailSchema,
    passwordSchema,
    USER_ROLES,
    usernameSchema
} from './schemas.js';
import { socialLinksSchema } from './social.js';
import type { UserDto } from './schemas.js';

const roleSchema = z.enum(USER_ROLES);

/** Admin creates an account directly (works even when public signups are off). */
export const adminCreateUserSchema = z.object({
    username: usernameSchema,
    email: emailSchema,
    password: passwordSchema,
    role: roleSchema.default('gamer')
});
export type AdminCreateUserInput = z.infer<typeof adminCreateUserSchema>;

/** Every editable field of a user except the password, which has its own reset action. */
export const adminUpdateUserSchema = z.object({
    username: usernameSchema,
    email: emailSchema,
    role: roleSchema,
    ...accountProfileSchema.shape,
    ...socialLinksSchema.shape
});
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;

export const adminResetPasswordSchema = z.object({ password: passwordSchema });
export type AdminResetPasswordInput = z.infer<typeof adminResetPasswordSchema>;

/** A user as the admin list and edit page see them. */
export interface AdminUserDto extends UserDto {
    createdAt: number;
    /** Games in their collection */
    gameCount: number;
}
