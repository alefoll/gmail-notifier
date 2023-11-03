"use strict";
const clientId = "910513932868-lgh57u3h6ks6tmddivhjr6hqn8cgau0i.apps.googleusercontent.com";
const clientSecret = "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";
const icons = {
    read: {
        48: browser.runtime.getURL("../icons/icon-read-48.png"),
        92: browser.runtime.getURL("../icons/icon-read-92.png"),
    },
    unread: {
        48: browser.runtime.getURL("../icons/icon-unread-48.png"),
        92: browser.runtime.getURL("../icons/icon-unread-92.png"),
    },
};
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
        "openid profile email",
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
                    picture: userInfo.picture,
                    refresh_token,
                }
            ]
        });
    }
    else {
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
// messageId, timeToReShownTheNotification
const notificationHistory = new Map();
// Re shown the notification after 5 minutes
const notificationReShownDelay = 300000;
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
                        picture: "",
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
        const messages = result.messages || [];
        return messages.map(message => message.id);
    }
    async run(onUpdate) {
        const messageIds = await this.getUnreadMessageIds();
        const messages = await this.getMessagesFromIds(messageIds);
        onUpdate(messages);
        for (let message of messages) {
            const notification = notificationHistory.get(message.id);
            if (notification && Date.now() < notification) {
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
            const headerToWithoutBrackets = headerTo.replaceAll(/<|>/g, "");
            const notificationImageUrl = browser.runtime.getURL("../icons/icon-notification.png");
            browser.notifications.create(`${this.email}<TAG>${message.id}`, {
                iconUrl: notificationImageUrl,
                message: `${headerFromtWithoutEmail}\n${headerSubject}`,
                title: headerToWithoutBrackets,
                type: "basic",
            });
            notificationHistory.set(message.id, Date.now() + notificationReShownDelay);
        }
    }
}
async function openGmail({ currentTab, index, messageId, }) {
    const pattern = `https://mail.google.com/mail/u/${index}/`;
    const messageHash = messageId ? `/${messageId}` : "";
    if (currentTab?.url?.startsWith(`${pattern}#inbox${messageHash}`)) {
        return;
    }
    const tabsAlreadyOpened = await browser.tabs.query({
        currentWindow: true,
        url: `${pattern}*`
    });
    if (tabsAlreadyOpened.length > 0) {
        browser.tabs.update(tabsAlreadyOpened[0].id, {
            active: true,
            url: `${pattern}#inbox${messageHash}`
        });
        return;
    }
    browser.tabs.create({ url: `${pattern}#inbox${messageHash}` });
}
const allUpdatesByAccount = new Map();
browser.action.onClicked.addListener(async (currentTab) => {
    const hasUnreadEmail = [...allUpdatesByAccount.values()].flat().length > 0;
    if (!hasUnreadEmail) {
        openGmail({ index: 0, currentTab });
        return;
    }
    const storage = await browser.storage.local.get("accounts");
    const accounts = storage?.accounts || [];
    // How many account by index have unread emails?
    accounts.map((account, index) => {
        const unreadMessages = allUpdatesByAccount.get(account.email);
        if (!unreadMessages || unreadMessages.length === 0) {
            return;
        }
        const messageId = unreadMessages[0].id;
        openGmail({ index, currentTab, messageId });
    });
});
browser.menus.create({
    contexts: ["action"],
    id: "add_account",
    title: "Add an account",
});
browser.menus.onClicked.addListener(async (element) => {
    if (element.menuItemId === "add_account") {
        const code = await authorize();
        await fetchTokenFromCode(code);
    }
});
browser.notifications.onClicked.addListener(async (notificationId) => {
    const [accountEmail, messageId] = notificationId.split("<TAG>");
    if (!accountEmail || !messageId) {
        return;
    }
    const storage = await browser.storage.local.get("accounts");
    const accounts = storage?.accounts || [];
    const accountIndex = accounts.findIndex(element => element.email === accountEmail);
    if (accountIndex < 0) {
        return;
    }
    openGmail({ index: accountIndex, messageId });
});
browser.alarms.onAlarm.addListener(async () => {
    const storage = await browser.storage.local.get("accounts");
    const accounts = storage?.accounts || [];
    if (accounts.length > 0) {
        browser.menus.create({
            contexts: ["action"],
            id: "separator",
            type: "separator",
        });
    }
    for (let account of accounts) {
        browser.menus.create({
            contexts: ["action"],
            enabled: false,
            icons: {
                96: account.picture,
            },
            id: account.email,
            title: account.email,
        });
        const processing = new AccountProcessing(account);
        const onUpdate = (messages) => {
            allUpdatesByAccount.set(account.email, messages);
            const allMessages = [...allUpdatesByAccount.values()].flat();
            const unreadMessages = allMessages.length;
            browser.action.setBadgeText({
                text: unreadMessages === 0 ? "" : unreadMessages.toString(),
            });
            browser.action.setIcon({ path: unreadMessages ? icons.unread : icons.read });
        };
        processing.run(onUpdate);
    }
});
browser.runtime.onStartup.addListener(() => {
    browser.alarms.create("run", {
        periodInMinutes: 0.25,
        when: Date.now(),
    });
});
