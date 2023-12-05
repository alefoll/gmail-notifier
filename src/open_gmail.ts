export async function openGmail({
    currentTab,
    index,
    messageId,
}: {
    currentTab?: { url?: string },
    index: number,
    messageId?: string
}) {
    const pattern = `https://mail.google.com/mail/u/${ index }/`;
    const messageHash = messageId ? `/${ messageId }` : "";

    if (currentTab?.url?.startsWith(`${ pattern }#inbox${ messageHash }`)) {
        return;
    }

    const tabsAlreadyOpened = await browser.tabs.query({
        currentWindow: true,
        url: `${ pattern }*`
    });

    if (tabsAlreadyOpened.length > 0) {
        browser.tabs.update(tabsAlreadyOpened[0].id, {
            active: true,
            url: `${ pattern }#inbox${ messageHash }`
        });
        return;
    }

    browser.tabs.create({ url: `${ pattern }#inbox${ messageHash }` });
}
