import { Chat } from "../../src/components/Chat";

/**
 * Customer chat.
 *
 * The whole screen is the shared Chat component, which renders the channels
 * the server offers — "Customer Support" and "Vehicle Tracking" — above the
 * conversation list.
 *
 * This used to also list individual admins by name and open a direct thread
 * with whichever one was tapped. That is gone: a customer writes to a *group*
 * now, so one message reaches every admin rather than depending on which
 * person they happened to pick. Workshop threads start from a workshop's own
 * detail page, where the garage has already been chosen.
 */
export default function CustomerChatScreen() {
  return (
    <Chat
      title="Chat"
      emptyHint="No conversations yet. Start one from the options above."
    />
  );
}
