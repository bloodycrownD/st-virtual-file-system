export {}

declare global {
    interface ExtensionSettings {
        [key: string]: unknown;
    }

    interface EventTypes {
        [key: string]: string;
    }

    interface Window {
        [key: string]: unknown;
    }

    const SillyTavern: {
        getContext: () => {
            extensionSettings: Record<string, ExtensionSettings>;
            chatMetadata: Record<string, unknown>;
            saveSettingsDebounced: () => void;
            saveMetadata: () => void;
            eventSource: {
                on: (event: string, handler: (...args: unknown[]) => void) => void;
                removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
            };
            event_types: EventTypes;
            registerMacro: (name: string, handler: (nonce: string) => string | unknown) => void;
            unregisterMacro: (name: string) => void;
        };
    };

    const $: any;
    const toastr: {
        error: (message: string) => void;
    };
}
