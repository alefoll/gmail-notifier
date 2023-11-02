declare global {
    var browser: {
        action: {
            onClicked: {
                addListener: (opts: (opts: { url: string }) => void) => void,
            },
            setBadgeText: (opts: {
                text: string,
            }) => void,
            setIcon: (opts: {
                path: {
                    48: string,
                    92: string,
                },
            }) => void,
        },
        alarms: {
            create: (name: string, opts: {
                periodInMinutes: number,
                when: number,
            }) => void,
            onAlarm: {
                addListener: (callback: () => void) => void,
            },
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
                contexts: ["action"],
                enabled?: boolean,
                icons?: {
                    96: string,
                },
                id: string,
                title?: string,
                type?: "normal" | "separator",
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
                url?: string,
            }) => Promise<void>
        },
    }
}

export {};
