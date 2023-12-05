export async function createOrRefreshMenuItems(): Promise<void> {
    const storage = await browser.storage.local.get("accounts");
    const accounts: Account[] = storage?.accounts || [];

    if (accounts.length > 0) {
        await browser.menus.create({
            contexts: ["action"],
            id: "separator",
            type: "separator",
        });
    } else {
        await browser.menus.remove("separator");
    }

    for (const account of accounts) {
        await browser.menus.create({
            contexts: ["action"],
            enabled: true,
            icons: {
                96: account.picture,
            },
            id: account.email,
            title: account.email,
        });
    }
}
