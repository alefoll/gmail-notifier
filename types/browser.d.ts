declare global {
    var browser: {
        action: {
            onClicked: {
                addListener: (opts: (opts: { url: string }) => void) => void,
            },
            setBadgeText: (opts: {
                text: string,
            }) => void,
        },
        identity: {
            getRedirectURL: () => string,
            launchWebAuthFlow: (opts: {
                url: string,
                redirect_uri?: string,
                interactive?: boolean,
            }) => Promise<string>,
        },
        menus: {
            create: (opts: {
                contexts: ["all"]
                id: string,
                title: string,
            }) => void,
            onClicked: {
                addListener: (listener: (element: { menuItemId?: string }) => void) => void
            }
        },
        notifications: {
            create: (id: string, opts: {
                iconUrl: string,
                message: string,
                title: string,
                type: "basic",
            }) => Promise<void>,
            onClicked: {
                addListener: (listener: (notificationId: string) => void) => void
            },
        },
        runtime: {
            getURL: (path: string) => string,
        },
        storage: {
            local: {
                get: <T>(key?: Object) => Promise<T | undefined>,
                set: (key: Object) => Promise<void>,
            },
            sync: {
                get: <T>(key?: Object) => Promise<T | undefined>,
                set: (key: Object) => Promise<void>,
            },
        },
        tabs: {
            create: (opts: {
                url: string,
            }) => Promise<void>,
            query: (opts: {
                currentWindow?: boolean,
                url?: string | string[],
            }) => Promise<{ id: number }[]>,
            update: (tabId: number, opts: {
                active: boolean,
            }) => Promise<void>
        },
    }
}

export {};