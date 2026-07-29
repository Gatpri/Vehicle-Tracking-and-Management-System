import SOSAlert from "../models/SOSAlert.js";
import { getIO } from "../config/socket.js";

export const registerSosHandlers = (socket) => {
  // SOS creation/resolution happens over REST (routes/sos.js) so it's a
  // clean, retryable HTTP call in an emergency. This socket event just lets
  // the alerting user's client stream live movement while help is en route.
  socket.on("sos:updateLocation", async ({ alertId, lat, lng }, ack) => {
    try {
      const alert = await SOSAlert.findById(alertId);
      if (!alert) return ack?.({ success: false, message: "Alert not found" });
      if (!alert.user.equals(socket.user._id)) return ack?.({ success: false, message: "Forbidden" });
      if (alert.status !== "active") return ack?.({ success: false, message: "Alert already resolved" });

      alert.location = { lat, lng };
      await alert.save();

      getIO().to("admins").emit("sos:locationUpdate", alert);
      ack?.({ success: true });
    } catch (err) {
      ack?.({ success: false, message: err.message });
    }
  });
};
