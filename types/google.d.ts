declare global {
    interface Account {
        access_token: string;
        email: string;
        picture: string;
        refresh_token: string;
    }
}

export {};
