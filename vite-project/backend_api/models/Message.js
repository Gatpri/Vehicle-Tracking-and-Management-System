import mongoose from "mongoose";

/** How long after sending a message may still be edited. */
export const EDIT_WINDOW_MS = 3 * 60 * 1000;

const MessageSchema = new mongoose.Schema({
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true, index: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  /**
   * Not `required`: unsending blanks this to "" so the content is genuinely
   * gone from the database, and a required field would reject that write.
   * Non-empty text is enforced where messages are created instead.
   */
  text: { type: String, default: "" },

  /**
   * Every previous version, oldest first. Appended to on each edit so the
   * reader can expand an edited message and see what it said before.
   *
   * Kept as history rather than a single `originalText` because a message can
   * be edited more than once inside the window, and showing only the first
   * version would misrepresent the middle ones.
   */
  editHistory: [{
    text: { type: String, required: true },
    /** When this version was replaced. */
    editedAt: { type: Date, required: true },
    _id: false,
  }],

  /** When the current text was set. Null when never edited. */
  editedAt: { type: Date, default: null },

  /**
   * Unsent messages are soft-deleted, not removed.
   *
   * The row stays so the thread still shows that something was there — a
   * conversation where messages silently vanish leaves replies answering
   * nothing. `text` is blanked at the same time so the content is genuinely
   * gone rather than merely hidden by the client, which anyone reading the API
   * response directly could otherwise recover.
   */
  deletedAt: { type: Date, default: null },
}, { timestamps: true });

/** Can this message still be edited by its sender? */
MessageSchema.methods.isEditable = function () {
  if (this.deletedAt) return false;
  return Date.now() - this.createdAt.getTime() <= EDIT_WINDOW_MS;
};

const Message = mongoose.model("Message", MessageSchema);
export default Message;
