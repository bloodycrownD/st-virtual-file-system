/**
 * Logical message event kinds routed by the message controller.
 * SillyTavern `event_types` string values vary by version; the adapter reads them from context.
 */
export type StMessageEventKind =
  | 'MESSAGE_RECEIVED'
  | 'MESSAGE_EDITED'
  | 'MESSAGE_UPDATED'
  | 'MESSAGE_DELETED'
