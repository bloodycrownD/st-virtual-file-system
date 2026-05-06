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
            saveSettingsDebounced: () => void;
            eventSource: {
                on: (event: string, handler: (...args: unknown[]) => void) => void;
            };
            event_types: EventTypes;
        };
    };

    const $: any;
}
