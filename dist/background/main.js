"use strict";
const clientId = "910513932868-lgh57u3h6ks6tmddivhjr6hqn8cgau0i.apps.googleusercontent.com";
const clientSecret = "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";
const wait = (delay) => new Promise((resolve) => setTimeout(resolve, delay));
class JWT {
    b64DecodeUnicode(str) {
        return decodeURIComponent(atob(str).replace(/(.)/g, (m, p) => {
            let code = p.charCodeAt(0).toString(16).toUpperCase();
            if (code.length < 2) {
                code = "0" + code;
            }
            return "%" + code;
        }));
    }
    base64UrlDecode(str) {
        let output = str.replace(/-/g, "+").replace(/_/g, "/");
        switch (output.length % 4) {
            case 0:
                break;
            case 2:
                output += "==";
                break;
            case 3:
                output += "=";
                break;
            default:
                throw new Error("base64 string is not of the correct length");
        }
        try {
            return this.b64DecodeUnicode(output);
        }
        catch (err) {
            return atob(output);
        }
    }
    decode(token) {
        if (typeof token !== "string") {
            throw new Error("Invalid token specified: must be a string");
        }
        const pos = 1;
        const part = token.split(".")[pos];
        if (typeof part !== "string") {
            throw new Error(`Invalid token specified: missing part #${pos + 1}`);
        }
        let decoded;
        try {
            decoded = this.base64UrlDecode(part);
        }
        catch (e) {
            throw new Error(`Invalid token specified: invalid base64 for part #${pos + 1} (${e.message})`);
        }
        try {
            return JSON.parse(decoded);
        }
        catch (e) {
            throw new Error(`Invalid token specified: invalid json for part #${pos + 1} (${e.message})`);
        }
    }
}
async function authorize() {
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
        "openid email",
    ];
    url.searchParams.append("access_type", accessType);
    url.searchParams.append("client_id", clientId);
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
        throw new Error(`Unable to find the access token in : "${returnLink}"`);
    }
    return code;
}
async function fetchTokenFromCode(code) {
    const url = new URL("https://oauth2.googleapis.com/token");
    const grantType = "authorization_code";
    const redirectUri = browser.identity.getRedirectURL();
    url.searchParams.append("client_id", clientId);
    url.searchParams.append("client_secret", clientSecret);
    url.searchParams.append("code", code);
    url.searchParams.append("grant_type", grantType);
    url.searchParams.append("redirect_uri", redirectUri);
    const request = await fetch(url, { method: "POST" });
    const result = await request.json();
    const { access_token, id_token, refresh_token } = result;
    if (!access_token || !refresh_token || !id_token) {
        throw new Error(`Error token on : "${JSON.stringify(result)}"`);
    }
    const jwt = new JWT();
    const userInfo = jwt.decode(id_token);
    const storage = await browser.storage.local.get("accounts");
    const accounts = storage?.accounts || [];
    const account = accounts.find(account => account.email === userInfo.email);
    if (!account) {
        await browser.storage.local.set({
            accounts: [
                ...accounts, {
                    access_token,
                    email: userInfo.email,
                    refresh_token,
                }
            ]
        });
    }
    else {
        account.access_token = access_token;
        account.refresh_token = refresh_token;
        await browser.storage.local.set({ accounts });
    }
    return {
        access_token,
        email: userInfo.email,
        refresh_token,
    };
}
browser.action.onClicked.addListener(async (currentTab) => {
    const pattern = "https://mail.google.com/mail/u/";
    if (currentTab.url.startsWith(pattern)) {
        return;
    }
    const tabsAlreadyOpened = await browser.tabs.query({
        currentWindow: true,
        url: `${pattern}*`
    });
    if (tabsAlreadyOpened.length > 0) {
        browser.tabs.update(tabsAlreadyOpened[0].id, {
            active: true,
        });
        return;
    }
    browser.tabs.create({ url: `${pattern}0/#inbox` });
});
browser.menus.create({
    contexts: ["all"],
    id: "root",
    title: "Add an account",
});
browser.menus.onClicked.addListener(async (element) => {
    if (element.menuItemId === "root") {
        const code = await authorize();
        await fetchTokenFromCode(code);
    }
});
class AccountProcessing {
    access_token;
    email;
    cachedMessages = new Map();
    refresh_token;
    constructor(account) {
        this.access_token = account.access_token;
        this.email = account.email;
        this.refresh_token = account.refresh_token;
    }
    async callApi(url, tries = 0) {
        if (tries > 3) {
            throw new Error("Error with the API");
        }
        const request = await fetch(url, {
            headers: {
                "Authorization": `Bearer ${this.access_token}`
            },
        });
        const response = await request.json();
        if (response.error && response.error.status === "UNAUTHENTICATED") {
            await this.refreshAccessToken();
            return this.callApi(url, tries + 1);
        }
        return response;
    }
    async refreshAccessToken() {
        const url = new URL("https://oauth2.googleapis.com/token");
        const grantType = "refresh_token";
        url.searchParams.append("client_id", clientId);
        url.searchParams.append("client_secret", clientSecret);
        url.searchParams.append("grant_type", grantType);
        url.searchParams.append("refresh_token", this.refresh_token);
        const request = await fetch(url, { method: "POST" });
        const result = await request.json();
        const { access_token } = result;
        if (!access_token) {
            throw new Error(`Error refresh token on : "${JSON.stringify(result)}"`);
        }
        this.access_token = access_token;
        const storage = await browser.storage.local.get("accounts");
        const accounts = storage?.accounts || [];
        const account = accounts.find(account => account.email === this.email);
        if (!account) {
            await browser.storage.local.set({
                accounts: [
                    ...accounts, {
                        access_token,
                        email: this.email,
                        refresh_token: this.refresh_token,
                    }
                ]
            });
            return;
        }
        account.access_token = access_token;
        await browser.storage.local.set({ accounts });
    }
    async getMessagesFromIds(messageIds) {
        const result = [];
        for (let messageId of messageIds) {
            const cachedMessage = this.cachedMessages.get(messageId);
            if (cachedMessage) {
                result.push(cachedMessage);
                continue;
            }
            const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`);
            url.searchParams.append("format", "metadata");
            url.searchParams.append("metadataHeaders", "From");
            url.searchParams.append("metadataHeaders", "Subject");
            url.searchParams.append("metadataHeaders", "To");
            const message = await this.callApi(url);
            this.cachedMessages.set(message.id, message);
            result.push(message);
        }
        return result;
    }
    async getUnreadMessageIds() {
        const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
        url.searchParams.append("labelIds", "UNREAD");
        url.searchParams.append("labelIds", "INBOX");
        const result = await this.callApi(url);
        return result.messages.map(message => message.id);
    }
    async run() {
        const messageNotificationShown = new Set();
        while (true) {
            const messageIds = await this.getUnreadMessageIds();
            const messages = await this.getMessagesFromIds(messageIds);
            browser.action.setBadgeText({
                text: messages.length.toString(),
            });
            // browser.notifications.onClicked.addListener((noticationId) => {
            //     const message = messages.find(message => message.id === noticationId);
            //     if (!message) {
            //         return;
            //     }
            // });
            for (let message of messages) {
                if (messageNotificationShown.has(message.id)) {
                    continue;
                }
                const header = new Map(message.payload.headers.map(element => [element.name, element.value]));
                const headerFrom = header.get("From");
                const headerSubject = header.get("Subject");
                const headerTo = header.get("To");
                if (!headerFrom || !headerSubject || !headerTo) {
                    throw new Error(`Invalid header for message id: ${message.id}. Data: ${JSON.stringify(message)}`);
                }
                const headerFromtWithoutEmail = headerFrom.replace(/ <.*@.*>/, "");
                const notificationImageUrl = browser.runtime.getURL("../icons/icon-notification.png");
                browser.notifications.create(message.id, {
                    iconUrl: notificationImageUrl,
                    message: `${headerFromtWithoutEmail}\n${headerSubject}`,
                    title: headerTo,
                    type: "basic",
                });
                messageNotificationShown.add(message.id);
            }
            await wait(15000);
        }
    }
}
async function main() {
    const storage = await browser.storage.local.get("accounts");
    const accounts = storage?.accounts || [];
    for (let account of accounts) {
        const processing = new AccountProcessing(account);
        processing.run();
    }
}
main();
