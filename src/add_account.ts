import { jwtDecode } from "jwt-decode";

import { config } from "./config";
import { createOrRefreshMenuItems } from "./create_or_refresh_menu_items";

export async function addAccount(): Promise<Account | undefined> {
    const code = await authorize();

    return await fetchTokenFromCode(code);
}

async function authorize(): Promise<string> {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");

    const accessType = "offline";
    const prompt = "consent";
    const redirectUri = browser.identity.getRedirectURL();
    const responseType = "code";
    const scopes = [
        "https://mail.google.com/",
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.metadata",
        "openid profile email",
    ];

    url.searchParams.append("access_type", accessType);
    url.searchParams.append("client_id", config.clientId);
    url.searchParams.append("prompt", prompt);
    url.searchParams.append("redirect_uri", redirectUri);
    url.searchParams.append("response_type", responseType);
    url.searchParams.append("scope", scopes.join(" "));

    const returnLink = await browser.identity.launchWebAuthFlow({
        interactive: true,
        url: url.toString(),
    });

    const returnUrl = new URL(returnLink);

    const code = returnUrl.searchParams.get("code");

    if (!code) {
        throw new Error(`Unable to find the access token in : "${ returnLink }"`);
    }

    return code;
}

async function fetchTokenFromCode(code: string): Promise<Account> {
    const url = new URL("https://oauth2.googleapis.com/token");

    const grantType = "authorization_code";
    const redirectUri = browser.identity.getRedirectURL();

    url.searchParams.append("client_id", config.clientId);
    url.searchParams.append("client_secret", config.clientSecret);
    url.searchParams.append("code", code);
    url.searchParams.append("grant_type", grantType);
    url.searchParams.append("redirect_uri", redirectUri);

    const request = await fetch(url, { method: "POST" });
    const result = await request.json();

    const { access_token, id_token, refresh_token } = result;

    if (!access_token || !refresh_token || !id_token) {
        throw new Error(`Error token on : "${ JSON.stringify(result) }"`);
    }

    const userInfo = jwtDecode<Account>(id_token);

    const storage = await browser.storage.local.get("accounts");

    const accounts: Account[] = storage?.accounts || [];

    const account = accounts.find(account => account.email === userInfo.email);

    if (!account) {
        await browser.storage.local.set({
            accounts: [
                ...accounts, {
                    access_token,
                    email: userInfo.email,
                    picture: userInfo.picture,
                    refresh_token,
                }
            ]
        });

        await createOrRefreshMenuItems();
    } else {
        account.access_token = access_token;
        account.email = userInfo.email;
        account.picture = userInfo.picture;
        account.refresh_token = refresh_token;

        await browser.storage.local.set({ accounts });
    }

    return {
        access_token,
        email: userInfo.email,
        picture: userInfo.picture,
        refresh_token,
    };
}
