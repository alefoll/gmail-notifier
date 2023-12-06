export const config = {
    clientId: "910513932868-lgh57u3h6ks6tmddivhjr6hqn8cgau0i.apps.googleusercontent.com",
    clientSecret: "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",
    icons: {
        read: {
            48: browser.runtime.getURL("../icons/icon-read-48.png"),
            92: browser.runtime.getURL("../icons/icon-read-92.png"),
        },
        unread: {
            48: browser.runtime.getURL("../icons/icon-unread-48.png"),
            92: browser.runtime.getURL("../icons/icon-unread-92.png"),
        },
    },
    notificationImageUrl: browser.runtime.getURL("../icons/icon-notification.png"),
};
