import { AccountProcessing } from "./account_processing";
import { addAccount } from "./add_account";
import { config } from "./config";
import { createOrRefreshMenuItems } from "./create_or_refresh_menu_items";
import { openGmail } from "./open_gmail";

const allUnreadMessagesByAccount: Map<string, Message[]> = new Map();
const notificationMessagesByAccount: Map<string, Map<string, number>> = new Map();

browser.action.onClicked.addListener(async (currentTab) => {
    const storage = await browser.storage.local.get("accounts");
    const accounts: Account[] = storage?.accounts || [];

    if (accounts.length === 0) {
        return await addAccount();
    }

    const hasUnreadEmail = [...allUnreadMessagesByAccount.values()].flat().length > 0;

    if (!hasUnreadEmail) {
        openGmail({ index: 0, currentTab });

        return;
    }

    accounts.map((account, index) => {
        const unreadMessages = allUnreadMessagesByAccount.get(account.email);

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
        await addAccount();

        return;
    }

    const storage = await browser.storage.local.get("accounts");
    const accounts: Account[] = storage?.accounts || [];

    const accountIndex = accounts.findIndex(account => account.email === element.menuItemId);

    if (accountIndex < 0) {
        return;
    }

    openGmail({ index: accountIndex });
});

browser.notifications.onClicked.addListener(async (notificationId) => {
    const [accountEmail, messageId] = notificationId.split("<TAG>");

    if (!accountEmail || !messageId) {
        return;
    }

    const storage = await browser.storage.local.get("accounts");
    const accounts: Account[] = storage?.accounts || [];

    const accountIndex = accounts.findIndex(element => element.email === accountEmail);

    if (accountIndex < 0) {
        return;
    }

    openGmail({ index: accountIndex, messageId });
});

browser.alarms.onAlarm.addListener(async () => {
    const storage = await browser.storage.local.get("accounts");
    const accounts: Account[] = storage?.accounts || [];

    await createOrRefreshMenuItems();

    for (const account of accounts) {
        const processing = new AccountProcessing({ account, createOrRefreshMenuItems });

        if (!notificationMessagesByAccount.has(account.email)) {
            notificationMessagesByAccount.set(account.email, new Map<string, number>());
        }

        const notificationMessages = notificationMessagesByAccount.get(account.email);

        if (!notificationMessages) {
            throw new Error("Unable to reach notificationMessages");
        }

        const onUpdate = (messages: Message[]) => {
            allUnreadMessagesByAccount.set(account.email, messages);

            for (const message of messages) {
                const notificationShownDate = processing.maybeShowNotification({
                    message,
                    lastShown: notificationMessages.get(message.id),
                });

                if (notificationShownDate) {
                    notificationMessages.set(message.id, notificationShownDate);
                }
            }

            const allMessages = [...allUnreadMessagesByAccount.values()].flat();

            browser.action.setBadgeText({
                text: allMessages.length === 0 ? "" : allMessages.length.toString(),
            });

            browser.action.setIcon({ path: allMessages.length === 0 ? config.icons.read : config.icons.unread });
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
