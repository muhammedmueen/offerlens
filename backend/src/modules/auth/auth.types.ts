export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
}

export interface JwtPayload {
    userId: string;
    email: string;
}

export interface SignupInput {
    email: string;
    password: string;
    name?: string;
}

export interface LoginInput {
    email: string;
    password: string;
}

export interface GoogleAuthInput {
    idToken?: string;
    accessToken?: string;
}

export interface AuthResponse {
    user: {
        id: string;
        email: string;
        name: string | null;
        avatarUrl: string | null;
    };
    tokens: AuthTokens;
}
