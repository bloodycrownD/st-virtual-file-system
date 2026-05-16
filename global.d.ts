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

    interface FunctionToolDefinition {
        name: string;
        displayName?: string;
        description: string;
        parameters: Record<string, unknown>;
        action: (args: Record<string, unknown>) => Promise<string> | string;
        formatMessage?: (args: Record<string, unknown>) => string;
        shouldRegister?: () => boolean;
        stealth?: boolean;
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
            registerFunctionTool: (definition: FunctionToolDefinition) => void;
            unregisterFunctionTool: (name: string) => void;
            isToolCallingSupported: () => boolean;
            canPerformToolCalls?: (mode: string) => boolean;
        };
    };

    const $: any;
    const toastr: {
        error: (message: string) => void;
        success: (message: string) => void;
        warning: (message: string) => void;
        info: (message: string) => void;
    };
}
