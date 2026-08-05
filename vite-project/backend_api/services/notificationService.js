import Notification from "../models/Notification.js";
import { getIO } from "../config/socket.js";

// Persists a notification and pushes it live to the recipient if they happen
// to be connected. Persisting first is the point: a socket-only alert reaches
// nobody when the user is logged out, which is exactly when it matters. The
// bell shows it on their next visit either way.
export const notify = async ({ user, type, title, body = "", link = "", meta = {} }) => {
  const notification = await Notification.create({ user, type, title, body, link, meta });
  getIO().to(`user:${user}`).emit("notification:new", notification);
  return notification;
};

// Same event to several people (e.g. every admin on a workshop). Failures are
// swallowed per-recipient so one bad id can't sink the whole batch — a
// notification is never important enough to fail the action that caused it.
export const notifyMany = async (userIds, payload) => {
  const unique = [...new Set(userIds.filter(Boolean).map(String))];
  return Promise.all(
    unique.map((user) =>
      notify({ ...payload, user }).catch((err) => {
        console.error(`Failed to notify ${user}:`, err.message);
        return null;
      })
    )
  );
};
