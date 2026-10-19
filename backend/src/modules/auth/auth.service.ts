import { db } from '@/db/index.js';
import { users } from '@/db/schema/users.js';
import { refreshTokens } from '@/db/schema/refresh-tokens.js';
import { offers } from '@/db/schema/offers.js';
import { eq, and } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import type { OAuth2Client } from 'google-auth-library';
import { config } from '@/config/index.js';
import { ACCESS_TOKEN_EXPIRY, REFRESH_TOKEN_EXPIRY_MS } from '@/config/constants.js';
import { AppError } from '@/shared/errors/app-error.js';
import { ERROR_CODES } from '@/shared/errors/error-codes.js';
import { AuthTokens, AuthResponse, JwtPayload, SignupInput, LoginInput, GoogleAuthInput } from './auth.types.js';

const BCRYPT_ROUNDS = 12;

/** What a verified Google token tells us about its owner. */
interface GoogleIdentity {
    sub?: string;
    email?: string;
    emailVerified: boolean;
    name?: string;
    picture?: string;
}

// The implicit flow asks for `openid profile email`; tokeninfo reports the email scope by its URL.
const GOOGLE_EMAIL_SCOPES = new Set(['email', 'https://www.googleapis.com/auth/userinfo.email']);

/** tokeninfo returns `email_verified` as the string "true"; an ID token carries a boolean. */
const isTrue = (v: unknown) => v === true || v === 'true';

/**
 * AUTH-1: every rejected Google sign-in gets the same 401, so the response says nothing about
 * whether an account exists. The reason is logged. Never the token, and never an error message:
 * google-auth-library puts the raw JWT in some of them ("Invalid token signature: <jwt>").
 */
function googleAuthFailed(reason: string, err?: unknown): AppError {
    const status = (err as { response?: { status?: number } } | undefined)?.response?.status;
    const cause = err === undefined ? '' : ` (${(err as Error)?.name ?? 'error'}${status ? ` ${status}` : ''})`;
    console.warn(`[Auth] Google sign-in rejected: ${reason}${cause}`);
    return new AppError(ERROR_CODES.INVALID_CREDENTIALS, 'Google sign-in failed. Please try again.', 401);
}

/**
 * AUTH-1: the access token from the frontend's implicit flow must have been issued to OUR client.
 * userinfo answers for a token from any app with the email scope, so it alone let any site where
 * the victim used "Sign in with Google" replay that token here. tokeninfo reports the token's `aud`
 * (for an access token, the OAuth client it was issued to), which must equal GOOGLE_CLIENT_ID.
 *
 * ponytail: two Google round-trips per access-token login (tokeninfo, then userinfo for name and
 * picture, which tokeninfo lacks). Switching the frontend to the ID-token or auth-code flow would
 * verify locally against cached certs and drop both.
 */
async function verifyGoogleAccessToken(client: OAuth2Client, accessToken: string): Promise<GoogleIdentity> {
    let info: Awaited<ReturnType<OAuth2Client['getTokenInfo']>>;
    try {
        // A 400 here means expired, revoked or not a Google token. Sent as a Bearer header, not a query string.
        info = await client.getTokenInfo(accessToken);
    } catch (err) {
        throw googleAuthFailed('tokeninfo rejected the access token', err);
    }

    if (info.aud !== config.GOOGLE_CLIENT_ID) {
        throw googleAuthFailed(`access token was issued to another client (aud ${info.aud})`);
    }
    if (!(info.expiry_date > Date.now())) throw googleAuthFailed('access token expired');
    if (!info.scopes?.some((s) => GOOGLE_EMAIL_SCOPES.has(s))) throw googleAuthFailed('access token lacks the email scope');

    // Audience verified, so userinfo is now safe to ask for the profile.
    let profile: { name?: string; picture?: string };
    try {
        const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) throw Object.assign(new Error('userinfo failed'), { response: { status: response.status } });
        profile = await response.json() as { name?: string; picture?: string };
    } catch (err) {
        throw googleAuthFailed('userinfo rejected the access token', err);
    }

    // Identity comes from tokeninfo, the response the audience check was made against.
    return {
        sub: info.sub,
        email: info.email,
        emailVerified: isTrue(info.email_verified),
        name: profile.name,
        picture: profile.picture,
    };
}

export class AuthService {
    async signup(input: SignupInput): Promise<AuthResponse> {
        const existing = await db.query.users.findFirst({
            where: eq(users.email, input.email.toLowerCase()),
        });

        if (existing) {
            throw new AppError(ERROR_CODES.EMAIL_IN_USE, 'An account with this email already exists. Did you mean to log in?', 409);
        }

        const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

        const [user] = await db.insert(users).values({
            email: input.email.toLowerCase(),
            passwordHash,
            name: input.name || null,
        }).returning();

        const tokens = await this.generateTokens({ userId: user.id, email: user.email });

        return {
            user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl },
            tokens,
        };
    }

    async login(input: LoginInput): Promise<AuthResponse> {
        const user = await db.query.users.findFirst({
            where: eq(users.email, input.email.toLowerCase()),
        });

        if (!user || !user.passwordHash) {
            throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid email or password', 401);
        }

        const valid = await bcrypt.compare(input.password, user.passwordHash);
        if (!valid) {
            throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid email or password', 401);
        }

        const tokens = await this.generateTokens({ userId: user.id, email: user.email });

        return {
            user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl },
            tokens,
        };
    }

    async googleAuth(input: GoogleAuthInput): Promise<AuthResponse> {
        // Dynamically import google-auth-library
        const { OAuth2Client } = await import('google-auth-library');

        if (!config.GOOGLE_CLIENT_ID) {
            throw new AppError(ERROR_CODES.SERVICE_UNAVAILABLE, 'Google OAuth is not configured', 503);
        }

        const client = new OAuth2Client(config.GOOGLE_CLIENT_ID);
        let payload: GoogleIdentity | undefined;

        if (input.idToken) {
            try {
                const ticket = await client.verifyIdToken({
                    idToken: input.idToken,
                    audience: config.GOOGLE_CLIENT_ID,
                });
                const p = ticket.getPayload();
                payload = p && {
                    sub: p.sub, email: p.email, emailVerified: isTrue(p.email_verified), name: p.name, picture: p.picture,
                };
            } catch (err) {
                throw googleAuthFailed('ID token failed verification', err);
            }
        } else if (input.accessToken) {
            payload = await verifyGoogleAccessToken(client, input.accessToken);
        }

        if (!payload?.email || !payload.sub) throw googleAuthFailed('token has no email or sub');
        // AUTH-1: an unverified address proves nothing about who owns it, so it may not create,
        // log into or link any account. Checked before any lookup, so it reveals nothing.
        if (!payload.emailVerified) throw googleAuthFailed('Google email is not verified');

        const email = payload.email.toLowerCase();

        // The Google account id (`sub`) is the identity; email is only used to link a first sign-in.
        let user = await db.query.users.findFirst({ where: eq(users.googleId, payload.sub) });

        if (!user) {
            user = await db.query.users.findFirst({ where: eq(users.email, email) });

            if (user?.googleId) {
                // Missed by googleId above, so this account is linked to a different Google account.
                throw googleAuthFailed('email belongs to an account linked to a different Google account');
            }

            if (!user) {
                [user] = await db.insert(users).values({
                    email,
                    name: payload.name || null,
                    avatarUrl: payload.picture || null,
                    googleId: payload.sub,
                    isEmailVerified: payload.emailVerified,
                }).returning();
            } else {
                // Link Google to an existing email/password account. Safe only because the token's
                // audience and `email_verified` were checked above: Google has proved this person
                // controls the address the account was registered with.
                await db.update(users)
                    .set({ googleId: payload.sub, avatarUrl: user.avatarUrl || payload.picture || null })
                    .where(eq(users.id, user.id));
            }
        }

        const tokens = await this.generateTokens({ userId: user.id, email: user.email });

        return {
            user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl },
            tokens,
        };
    }

    async refreshAccessToken(refreshToken: string): Promise<AuthTokens> {
        const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

        // AUTH-4: claim the row atomically. Of two concurrent refreshes with the same token only one
        // gets it back; the other is a 401. An expired row is consumed (deleted) here too, as before.
        const [stored] = await db.delete(refreshTokens)
            .where(eq(refreshTokens.tokenHash, tokenHash))
            .returning();

        if (!stored || stored.expiresAt < new Date()) {
            throw new AppError(ERROR_CODES.TOKEN_EXPIRED, 'Refresh token expired or invalid. Please log in again.', 401);
        }

        const user = await db.query.users.findFirst({ where: eq(users.id, stored.userId) });
        if (!user) throw new AppError(ERROR_CODES.NOT_FOUND, 'User not found', 404);

        return this.generateTokens({ userId: user.id, email: user.email });
    }

    async logout(refreshToken: string): Promise<void> {
        const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
        await db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash));
    }

    /**
     * Claim a guest's offers into a new account (ADR-001).
     *
     * `guestToken` is the value of the signed guest cookie. Because that cookie is
     * server-issued and signed, matching on it is now trustworthy — previously it was
     * `MD5(ip + userAgent)`, so signing up could migrate a stranger's offers.
     *
     * `claimedOfferIds` is optional defence in depth. When the client supplies the IDs
     * it holds, migration is restricted to that set; every ID is still verified against
     * the guest row, so a forged list grants nothing. When omitted — a returning guest
     * whose localStorage was cleared but whose cookie survived — all of that guest's
     * offers are migrated, which is safe for the same reason.
     */
    async migrateGuestOffers(
        guestToken: string,
        userId: string,
        claimedOfferIds?: string[],
    ): Promise<number> {
        const now = new Date();

        const { guests } = await import('@/db/schema/guests.js');

        const guest = await db.query.guests.findFirst({
            where: eq(guests.fingerprint, guestToken),
        });

        if (!guest) return 0;

        // Ownership is enforced here, in the query, not against the client's list.
        const guestOffers = await db.query.offers.findMany({
            where: and(
                eq(offers.guestId, guest.id),
                eq(offers.isGuest, true),
            ),
        });

        const claimed = claimedOfferIds && claimedOfferIds.length > 0
            ? new Set(claimedOfferIds)
            : null;

        const validOffers = guestOffers.filter(o =>
            (!o.expiresAt || o.expiresAt > now) &&
            (claimed === null || claimed.has(o.id))
        );

        if (validOffers.length === 0) return 0;

        // Migrate each offer
        for (const offer of validOffers) {
            await db.update(offers)
                .set({
                    userId,
                    isGuest: false,
                    expiresAt: null, // Remove TTL for registered users
                })
                .where(eq(offers.id, offer.id));
        }

        return validOffers.length;
    }

    private async generateTokens(payload: JwtPayload): Promise<AuthTokens> {
        const accessToken = jwt.sign(payload, config.JWT_SECRET, {
            expiresIn: ACCESS_TOKEN_EXPIRY,
        });

        const refreshTokenValue = crypto.randomBytes(40).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(refreshTokenValue).digest('hex');

        await db.insert(refreshTokens).values({
            userId: payload.userId,
            tokenHash,
            expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS),
        });

        return { accessToken, refreshToken: refreshTokenValue };
    }

    verifyAccessToken(token: string): JwtPayload {
        try {
            return jwt.verify(token, config.JWT_SECRET) as JwtPayload;
        } catch {
            throw new AppError(ERROR_CODES.TOKEN_EXPIRED, 'Access token expired or invalid', 401);
        }
    }
}
