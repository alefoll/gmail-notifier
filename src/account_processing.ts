import { config } from "./config";

export class AccountProcessing {
    private access_token: string;
    private cachedMessages: Map<string, Message> = new Map();
    private refresh_token: string;

    // Re shown the notification after 5 minutes
    private notificationReShownDelay = 300_000;

    constructor(
        private deps: {
            readonly account: Account;
            readonly createOrRefreshMenuItems: () => Promise<void>;
        },
    ) {
        this.access_token = deps.account.access_token;
        this.refresh_token = deps.account.refresh_token;
    }

    private async callApi<T>(url: URL, tries = 0): Promise<T> {
        if (tries > 3) {
            throw new Error("Error with the API");
        }

        const request = await fetch(url, {
            headers: {
                Authorization: `Bearer ${this.access_token}`,
            },
        });

        const response = await request.json();

        if (response.error && response.error.status === "UNAUTHENTICATED") {
            await this.refreshAccessToken();

            return this.callApi(url, tries + 1);
        }

        return response;
    }

    private async refreshAccessToken() {
        const url = new URL("https://oauth2.googleapis.com/token");

        const grantType = "refresh_token";

        url.searchParams.append("client_id", config.clientId);
        url.searchParams.append("client_secret", config.clientSecret);
        url.searchParams.append("grant_type", grantType);
        url.searchParams.append("refresh_token", this.refresh_token);

        const request = await fetch(url, { method: "POST" });
        const result = await request.json();

        const storage = await browser.storage.local.get("accounts");
        const accounts: Account[] = storage?.accounts || [];

        const account = accounts.find(account => account.email === this.deps.account.email);

        const { access_token } = result;

        if (!access_token) {
            if (!account) {
                return;
            }

            await browser.storage.local.set({
                accounts: accounts.filter(account => account.email !== this.deps.account.email),
            });

            await browser.menus.remove(this.deps.account.email);

            browser.notifications.create(`remove_account-${this.deps.account.email}`, {
                iconUrl: config.notificationImageUrl,
                message:
                    `Token for account ${this.deps.account.email} is no longer working. The account is removed, you will need to add it again.`,
                title: "Account removed",
                type: "basic",
            });

            await this.deps.createOrRefreshMenuItems();

            throw new Error(`Error refresh token on : "${JSON.stringify(result)}"`);
        }

        this.access_token = access_token;

        if (!account) {
            await browser.storage.local.set({
                accounts: [
                    ...accounts,
                    {
                        access_token,
                        email: this.deps.account.email,
                        picture: "",
                        refresh_token: this.refresh_token,
                    },
                ],
            });

            await this.deps.createOrRefreshMenuItems();

            return;
        }

        account.access_token = access_token;

        await browser.storage.local.set({ accounts });
    }

    private async getMessagesFromIds(messageIds: string[]): Promise<Message[]> {
        const result: Message[] = [];

        for (const messageId of messageIds) {
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

            const message = await this.callApi<Message>(url);

            this.cachedMessages.set(message.id, message);

            result.push(message);
        }

        return result;
    }

    private async getUnreadMessageIds(): Promise<string[]> {
        const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");

        url.searchParams.append("labelIds", "UNREAD");
        url.searchParams.append("labelIds", "INBOX");

        const result = await this.callApi<{ messages?: Pick<Message, "id">[]; }>(url);

        const messages = result.messages || [];

        return messages.map(message => message.id);
    }

    async run(onUpdate: (messages: Message[]) => void) {
        const messageIds = await this.getUnreadMessageIds();

        const messages = await this.getMessagesFromIds(messageIds);

        // NOTE: a thread can contains multiple messages, if a message in a thread is unread,
        // the API can return all the messages in the thread, creating unwanted multiple notifications
        const threads = new Map<string, Message>();

        for (const message of messages) {
            const thread = threads.get(message.threadId);

            if (!thread || message.internalDate > thread.internalDate) {
                threads.set(message.threadId, message);
            }
        }

        onUpdate([...threads.values()]);
    }

    maybeShowNotification({
        message,
        lastShown,
    }: {
        message: Message;
        lastShown: number | undefined;
    }): number | undefined {
        const currentDate = Date.now();

        if (lastShown && lastShown + this.notificationReShownDelay > currentDate) {
            return;
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

        browser.notifications.create(`${this.deps.account.email}<TAG>${message.id}`, {
            iconUrl: config.notificationImageUrl,
            message: `${headerFromtWithoutEmail}\n${headerSubject}`,
            title: headerToWithoutBrackets,
            type: "basic",
        });

        return currentDate;
    }
}
