import mongoose from "mongoose";
import Conversation, { CHANNEL_KINDS } from "../models/Conversation.js";
import User from "../models/User.js";
import Message from "../models/Message.js";
import Workshop from "../models/Workshop.js";
import { FULL_ADMIN_ROLES, TRACKING_ROLES } from "../constants/chatAudiences.js";
import { sameRegion, regionQuery } from "../utils/region.js";

/**
 * Who may read and answer a channel thread, and which channels a given user is
 * allowed to open.
 *
 * This is the single place those two questions are answered. Both the REST
 * controller and the socket handler call in here rather than each deciding for
 * themselves, because a divergence between them is exactly how someone ends up
 * able to read a thread over the socket that the REST route would refuse.
 *
 * The audience is derived from role at read time rather than stored on the
 * conversation. An admin hired tomorrow can answer a thread opened today, and
 * an admin who is demoted immediately loses access to threads they could
 * previously read — neither requires touching old documents.
 */

/**
 * Can `user` read/answer `conversation`?
 *
 * Ownership is checked first and cheaply: the person whose thread it is always
 * has access. Everything after that is the group audience.
 */
export const canAccessConversation = async (user, conversation) => {
  // Direct threads keep their original rule — participants only.
  if (!conversation.channel) {
    return conversation.participants.some((p) => p.equals(user._id));
  }

  // Your own thread is always yours.
  if (conversation.owner && conversation.owner.equals(user._id)) return true;

  switch (conversation.channel) {
    case CHANNEL_KINDS.SUPPORT:
      // Every full admin answers support.
      return FULL_ADMIN_ROLES.includes(user.role);

    case CHANNEL_KINDS.TRACKING:
      // Tracking admins, plus full admins who oversee everything.
      return TRACKING_ROLES.includes(user.role);

    case CHANNEL_KINDS.WORKSHOP: {
      // Whoever manages that specific garage — not every workshop-admin.
      if (FULL_ADMIN_ROLES.includes(user.role)) return true;
      if (user.role !== "workshop-admin" || !conversation.workshop) return false;
      const managed = await Workshop.findOne({
        _id: conversation.workshop,
        managedBy: user._id,
      }).select("_id");
      return Boolean(managed);
    }

    case CHANNEL_KINDS.DELIVERY_REGION:
      // Peer delivery-admins in the same region. Full admins can look.
      if (FULL_ADMIN_ROLES.includes(user.role)) return true;
      return user.role === "delivery-admin" && sameRegion(user.region, conversation.region);

    default:
      return false;
  }
};

/**
 * A Mongo filter matching every conversation `user` may see in their list.
 *
 * Built as a query rather than by fetching-then-filtering so the database does
 * the work — an admin answering support would otherwise pull every
 * conversation on the platform into memory to discard most of them.
 */
export const visibleConversationsFilter = async (user) => {
  const clauses = [
    // Direct threads, and any channel thread they own.
    { participants: user._id },
  ];

  if (FULL_ADMIN_ROLES.includes(user.role)) {
    // Full admins answer support and tracking, and may read workshop and
    // regional threads.
    clauses.push({ channel: { $type: "string" } });
  } else {
    if (TRACKING_ROLES.includes(user.role)) {
      clauses.push({ channel: CHANNEL_KINDS.TRACKING });
    }

    if (user.role === "workshop-admin") {
      const managed = await Workshop.find({ managedBy: user._id }).select("_id");
      if (managed.length > 0) {
        clauses.push({
          channel: CHANNEL_KINDS.WORKSHOP,
          workshop: { $in: managed.map((w) => w._id) },
        });
      }
    }

    if (user.role === "delivery-admin" && String(user.region ?? "").trim()) {
      clauses.push({
        channel: CHANNEL_KINDS.DELIVERY_REGION,
        region: regionQuery(user.region),
      });
    }
  }

  return { $or: clauses };
};

/**
 * Narrow a customer's conversation list to the threads that belong in it.
 *
 * A customer's list is meant to read as "garages I have talked to". Two things
 * would otherwise clutter it:
 *
 *   - Support and Vehicle Tracking threads, which already have a permanent
 *     home under "Start a chat". Showing them again below duplicates a row the
 *     customer never has to hunt for.
 *   - Workshop threads opened but never used — clicking "Chat with this
 *     workshop" creates the thread immediately, so a garage the customer only
 *     looked at would sit in the list as though a conversation happened.
 *
 * So: workshop threads only, and only ones carrying at least one message. A
 * customer who has never messaged a garage sees an empty list, which is the
 * honest answer.
 *
 * Staff lists are untouched — an admin's list *is* their support inbox, and an
 * empty thread there is a customer who opened a ticket and is still typing.
 */
export const pruneCustomerConversations = async (user, conversations) => {
  if (user.role !== "user") return conversations;

  const workshopThreads = conversations.filter((c) => c.channel === CHANNEL_KINDS.WORKSHOP);
  if (workshopThreads.length === 0) return [];

  // One query for the whole page rather than one per thread: distinct() gives
  // back exactly the ids that have messages, which is all this needs to know.
  const withMessages = await Message.distinct("conversation", {
    conversation: { $in: workshopThreads.map((c) => c._id) },
  });
  const active = new Set(withMessages.map(String));

  return workshopThreads.filter((c) => active.has(String(c._id)));
};

/**
 * The channels `user` may open a thread on, ready to render as a picker.
 *
 * Returned as data rather than hardcoded per client so the web app and the
 * mobile app cannot disagree about who may talk to whom.
 */
export const availableChannelsFor = async (user) => {
  const channels = [];

  // Everyone who is not a full admin can reach support — including staff, who
  // need a way to raise something with the people above them.
  if (!FULL_ADMIN_ROLES.includes(user.role)) {
    channels.push({
      channel: CHANNEL_KINDS.SUPPORT,
      label: "Customer Support",
      description: "Reaches the platform admins.",
    });
  }

  // Vehicle tracking: for reporting a stolen vehicle or chasing a sighting.
  // Not offered to the tracking admins themselves, who answer it.
  if (!TRACKING_ROLES.includes(user.role)) {
    channels.push({
      channel: CHANNEL_KINDS.TRACKING,
      label: "Vehicle Tracking",
      description: "Reaches the vehicle-tracking team.",
    });
  }

  // Workshop channels are deliberately NOT listed here.
  //
  // A customer may still message any workshop — getOrCreateChannelThread
  // allows it (see canOpenWorkshopChannel) — but the entry point is the
  // workshop's own detail page, where they have already chosen which garage
  // they mean. Listing every garage on the chat page put a wall of names in
  // front of someone who opened chat to reach support, and asked them to pick
  // a workshop out of context.
  //
  // Once a thread exists it appears in the conversation list like any other,
  // so this only affects where a *new* one is started.

  // Delivery-admins get a peer thread answered by the other admins in their
  // region. Skipped when their account has no region, since there would be no
  // audience to answer it.
  if (user.role === "delivery-admin" && String(user.region ?? "").trim()) {
    channels.push({
      channel: CHANNEL_KINDS.DELIVERY_REGION,
      label: `Delivery Admins — ${user.region}`,
      description: "Reaches the other delivery admins in your region.",
    });
  }

  return channels;
};

/**
 * May this user open a chat thread with this workshop?
 *
 * Customers only, and only against a real, active garage. The check exists
 * because workshop channels are not offered through availableChannelsFor —
 * they are opened from a workshop's own page — so without it the endpoint
 * would accept any id at all, including a deactivated workshop or a
 * non-workshop ObjectId.
 */
const canOpenWorkshopChannel = async (user, workshopId) => {
  if (user.role !== "user" || !workshopId) return false;
  // A malformed id would make the query throw a CastError, surfacing as a
  // server fault rather than the plain refusal this is.
  if (!mongoose.isValidObjectId(workshopId)) return false;
  const workshop = await Workshop.findOne({ _id: workshopId, status: "active" }).select("_id");
  return Boolean(workshop);
};

/**
 * Find or create this user's thread on a channel.
 *
 * Threads are keyed on (owner, channel, workshop) so each person gets exactly
 * one thread per channel — reopening the picker returns them to the same
 * conversation instead of starting a new one each time.
 */
export const getOrCreateChannelThread = async (user, { channel, workshopId }) => {
  if (!Object.values(CHANNEL_KINDS).includes(channel)) {
    throw new Error("Unknown channel");
  }

  // A user must be allowed to open the channel they are asking for — without
  // this, anyone could post into a regional delivery thread by naming it.
  //
  // Workshop channels are checked separately because they are deliberately
  // absent from availableChannelsFor: they are opened from a workshop's own
  // page rather than picked off a list, so there is no list to match against.
  if (channel === CHANNEL_KINDS.WORKSHOP) {
    if (!(await canOpenWorkshopChannel(user, workshopId))) {
      throw new Error("You cannot message that workshop");
    }
  } else {
    const allowed = await availableChannelsFor(user);
    const match = allowed.find((c) => c.channel === channel);
    if (!match) throw new Error("You cannot open that channel");
  }

  const query = {
    owner: user._id,
    channel,
    ...(channel === CHANNEL_KINDS.WORKSHOP ? { workshop: workshopId } : {}),
  };

  let conversation = await Conversation.findOne(query);
  if (conversation) return conversation;

  conversation = await Conversation.create({
    ...query,
    // The owner is the only fixed participant; the answering side is derived
    // from role, so adding admins here would go stale the moment staff change.
    participants: [user._id],
    region: channel === CHANNEL_KINDS.DELIVERY_REGION ? user.region : "",
  });

  return conversation;
};

/**
 * A display name for a conversation, from the point of view of `user`.
 *
 * Channel threads have no second participant to name them after, so without
 * this every one of them would render as "Conversation". What the label says
 * depends on which side you are on: the customer sees the channel they wrote
 * to ("Customer Support"), while the admin answering sees who wrote in — one
 * inbox of "Customer Support" rows would be unusable.
 */
export const labelConversation = (conversation, user) => {
  if (!conversation.channel) return null; // direct threads name themselves

  const isOwner = conversation.owner && String(conversation.owner._id ?? conversation.owner) === String(user._id);

  if (!isOwner) {
    // Answering side: name the person, since the channel is implied by which
    // inbox this is.
    const o = conversation.owner;
    const who = o && typeof o === "object"
      ? `${o.firstname ?? ""} ${o.lastname ?? ""}`.trim() || o.email
      : "Someone";
    switch (conversation.channel) {
      case CHANNEL_KINDS.SUPPORT: return `${who} — Support`;
      case CHANNEL_KINDS.TRACKING: return `${who} — Vehicle Tracking`;
      case CHANNEL_KINDS.WORKSHOP: return `${who} — ${conversation.workshop?.name ?? "Workshop"}`;
      case CHANNEL_KINDS.DELIVERY_REGION: return `${who} — ${conversation.region}`;
      default: return who;
    }
  }

  switch (conversation.channel) {
    case CHANNEL_KINDS.SUPPORT: return "Customer Support";
    case CHANNEL_KINDS.TRACKING: return "Vehicle Tracking";
    case CHANNEL_KINDS.WORKSHOP: return conversation.workshop?.name ?? "Workshop";
    case CHANNEL_KINDS.DELIVERY_REGION: return `Delivery Admins — ${conversation.region}`;
    default: return "Conversation";
  }
};

/**
 * The socket rooms a message on `conversation` should reach.
 *
 * A channel thread cannot use the single `chat:<id>` room the way a direct
 * thread does: the answering admins have not necessarily opened the thread, so
 * they were never in that room. Broadcasting to their per-user rooms as well
 * is what makes a new support message arrive without a refresh.
 */
export const roomsForConversation = async (conversation) => {
  const rooms = [`chat:${conversation._id}`];
  if (!conversation.channel) return rooms;

  const audienceQuery = (() => {
    switch (conversation.channel) {
      case CHANNEL_KINDS.SUPPORT:
        return { role: { $in: FULL_ADMIN_ROLES } };
      case CHANNEL_KINDS.TRACKING:
        return { role: { $in: TRACKING_ROLES } };
      case CHANNEL_KINDS.DELIVERY_REGION:
        return { role: "delivery-admin", region: regionQuery(conversation.region) };
      case CHANNEL_KINDS.WORKSHOP:
        return null; // resolved separately below
      default:
        return null;
    }
  })();

  if (audienceQuery) {
    const members = await User.find(audienceQuery).select("_id");
    members.forEach((m) => rooms.push(`user:${m._id}`));
  } else if (conversation.channel === CHANNEL_KINDS.WORKSHOP && conversation.workshop) {
    const workshop = await Workshop.findById(conversation.workshop).select("managedBy");
    if (workshop?.managedBy) rooms.push(`user:${workshop.managedBy}`);
    const fullAdmins = await User.find({ role: { $in: FULL_ADMIN_ROLES } }).select("_id");
    fullAdmins.forEach((m) => rooms.push(`user:${m._id}`));
  }

  if (conversation.owner) rooms.push(`user:${conversation.owner}`);

  return [...new Set(rooms)];
};
