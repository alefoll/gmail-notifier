declare global {
    // FROM: https://developers.google.com/gmail/api/reference/rest/v1/users.messages#Message
    interface Message {
        id: string;
        internalDate: string;
        threadId: string;
        payload: MessagePart;
    }

    interface MessagePart {
        headers: Header[];
    }

    interface Header {
        name: string;
        value: string;
    }
}

export {};
