import { z } from 'zod';

export const signupSchema = {
    body: z.object({
        email: z.string().email('Invalid email address'),
        password: z.string().min(8, 'Password must be at least 8 characters'),
        name: z.string().min(1).max(100).optional(),
    }),
};

export const loginSchema = {
    body: z.object({
        email: z.string().email('Invalid email address'),
        password: z.string().min(1, 'Password is required'),
    }),
};

export const googleAuthSchema = {
    body: z.object({
        idToken: z.string().optional(),
        accessToken: z.string().optional(),
    }).refine((data) => data.idToken || data.accessToken, {
        message: "Either idToken or accessToken is required",
        path: ["idToken"],
    }),
};

export const refreshTokenSchema = {
    body: z.object({
        refreshToken: z.string().min(1, 'Refresh token is required'),
    }),
};
