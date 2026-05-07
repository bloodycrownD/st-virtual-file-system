/**
 * @file Stable logical kinds for message events.
 *
 * SillyTavern exposes event names as runtime **string constants** via `getContext().event_types`.
 * Those string values can vary across SillyTavern versions. Internally we route by this stable
 * union type, and the adapter maps the runtime strings to these kinds.
 */
export type StMessageEventKind =
  | 'MESSAGE_RECEIVED'
  | 'MESSAGE_EDITED'
  | 'MESSAGE_UPDATED'
  | 'MESSAGE_DELETED'
