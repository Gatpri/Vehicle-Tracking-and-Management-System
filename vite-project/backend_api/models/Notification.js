import mongoose from "mongoose";

const NotificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  // Drives the icon and how the panel groups things. Add cases here rather
  // than inventing free-form strings at call sites.
  type: {
    type: String,
    enum: [
      "quote:received",   // workshop sent a parts quote
      "quote:responded",  // customer returned their selection
      "quote:accepted",
      "booking:status",
      "theft:sighting",
      "general",
    ],
    default: "general",
  },
  title: { type: String, required: true },
  body: { type: String, default: "" },
  // In-app path the panel navigates to when the row is clicked.
  link: { type: String, default: "" },
  read: { type: Boolean, default: false, index: true },
  // Free-form ids the UI may need (serviceRequestId, workshopId, ...). Kept
  // loose on purpose: a notification shouldn't need a schema change every time
  // a new event wants to carry one more reference.
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

// The panel's only query: this user's newest first, and the unread count.
NotificationSchema.index({ user: 1, createdAt: -1 });

const Notification = mongoose.model("Notification", NotificationSchema);
export default Notification;
