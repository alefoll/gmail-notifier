declare global {
    interface JwtDecodeOptions {
        header?: boolean;
    }

    interface JwtHeader {
        typ?: string;
        alg?: string;
        kid?: string;
    }

    interface JwtPayload {
        iss?: string;
        sub?: string;
        aud?: string[] | string;
        exp?: number;
        nbf?: number;
        iat?: number;
        jti?: string;
    }
}

export {};
