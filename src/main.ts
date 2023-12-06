import { AccountProcessing } from "./account_processing";
import { addAccount } from "./add_account";
import { config } from "./config";
import { createOrRefreshMenuItems } from "./create_or_refresh_menu_items";
import { openGmail } from "./open_gmail";

const allUpdatesByAccount: Map<string, Message[]> = new Map();
browser.action.onClicked.addListener(async (currentTab) => {
    const storage = await browser.storage.local.get("accounts");
    const accounts: Account[] = storage?.accounts || [];

    if (accounts.length === 0) {
        return await addAccount();
    }

    const hasUnreadEmail = [...allUpdatesByAccount.values()].flat().length > 0;

    if (!hasUnreadEmail) {
        openGmail({ index: 0, currentTab });

        return;
    }

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

const accountNotificationHistory = new Map<string, Map<string, number>>();

browser.alarms.onAlarm.addListener(async () => {
    const storage = await browser.storage.local.get("accounts");
    const accounts: Account[] = storage?.accounts || [];

    await createOrRefreshMenuItems();

    for (const account of accounts) {
        if (!accountNotificationHistory.has(account.email)) {
            accountNotificationHistory.set(account.email, new Map<string, number>());
        }

        const notificationHistory = accountNotificationHistory.get(account.email);

        if (!notificationHistory) {
            throw new Error("Can't find notificationHistory");
        }

        const processing = new AccountProcessing({ account, createOrRefreshMenuItems, notificationHistory });

        const onUpdate = (messages: Message[]) => {
            allUpdatesByAccount.set(account.email, messages);

            const allMessages = [...allUpdatesByAccount.values()].flat();

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
