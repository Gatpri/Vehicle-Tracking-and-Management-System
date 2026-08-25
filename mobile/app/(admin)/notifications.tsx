import { NotificationList } from "../../src/components/NotificationList";

/**
 * Notifications. The list itself is shared by every role — see
 * components/NotificationList.tsx, which reads from NotificationContext so the
 * tab badge and this screen can never disagree.
 */
export default function NotificationsScreen() {
  return <NotificationList />;
}
