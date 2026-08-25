import { Chat } from "../../src/components/Chat";

/**
 * Delivery-staff chat. Drivers hold chat:read:any so they can message a
 * customer about a delay, but they never start a support thread themselves,
 * so there is no conversation-starter here.
 */
export default function StaffChatScreen() {
  return (
    <Chat
      title="Messages"
      emptyHint="No conversations yet. Customers and admins can start one with you."
    />
  );
}
