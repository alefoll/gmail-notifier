declare global {
    interface Account {
        access_token: string;
        email: string;
        refresh_token: string;
    }
}

export {};
