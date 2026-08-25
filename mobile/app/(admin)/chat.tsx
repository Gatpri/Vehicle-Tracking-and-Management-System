import { Chat } from "../../src/components/Chat";

/**
 * Admin-side chat — the mobile version of AdminChatPage.tsx. Same thread UI as
 * the customer screen; admins are the recipients of support conversations
 * rather than the ones starting them.
 */
export default function AdminChatScreen() {
  return (
    <Chat
      title="Conversations"
      emptyHint="No conversations yet. Customers reaching support will appear here."
    />
  );
}
