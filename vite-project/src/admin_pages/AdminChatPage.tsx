import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "react-toastify";
import api, { getErrorMessage } from "../lib/api";
import { getSocket, subscribeWithReconnect } from "../lib/socket";
import { useAuth } from "../lib/AuthContext";
import { MessageBubble, type ChatMessage as Message } from "../components/MessageBubble";
import "./AdminPages.css";

interface Participant {
  _id: string;
  firstname: string;
  lastname: string;
  role: string;
}
interface Conversation {
  _id: string;
  participants: Participant[];
  lastMessageAt: string;
  /**
   * Server-computed name, present on channel threads (Customer Support,
   * Vehicle Tracking, a workshop, a regional delivery thread). Those have only
   * the owner as a participant, so there is no "other party" to name them
   * after — and on this side the label names the person who wrote in.
   */
  label?: string | null;
  channel?: string | null;
  /** Who opened the thread. Only set on channel threads. */
  owner?: Participant | null;
}
interface StaffMember {
  _id: string;
  firstname: string;
  lastname: string;
  role: string;
}

const ROLE_LABELS: Record<string, string> = {
  superadmin: "Superadmin",
  admin: "Admin",
  "vehicle-tracking-admin": "Vehicle Tracking Admin",
  "workshop-admin": "Workshop Admin",
};

function AdminChatPage() {
  const { user: me } = useAuth();
  // /api/me returns the id as "id", not "_id".
  const myId = me?.id;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [customers, setCustomers] = useState<{ _id: string; firstname: string; lastname: string; lastService: string }[]>([]);
  const [newCustomerId, setNewCustomerId] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newPersonId, setNewPersonId] = useState("");
  const [starting, setStarting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadConversations = async () => {
    try {
      const res = await api.get("/chat/conversations");
      setConversations(res.data.conversations);
    } catch {
      toast.error("Failed to load conversations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initial = async () => {
      await loadConversations();
      try {
        // Colleagues this account can open a thread with. The endpoint only
        // ever returns staff, so there is no way to start one with a
        // regular user from here — by design.
        const res = await api.get("/chat/support-admins");
        setStaff(res.data.admins);
      } catch {
        toast.error("Failed to load staff directory");
      }
      try {
        // Only workshop-admins get results here: people who booked at a garage
        // they manage. Everyone else gets an empty list and no picker.
        const res = await api.get("/chat/my-customers");
        setCustomers(res.data.customers ?? []);
      } catch {
        setCustomers([]);
      }
    };
    initial();
  }, []);

  useEffect(() => {
    const socket = getSocket();
    const onMessage = (msg: Message) => {
      if (msg.conversation === activeId) {
        setMessages((prev) => [...prev, msg]);
      }
      // Bump whichever conversation just got a message to the top of the list.
      loadConversations();
    };
    // An edit or an unsend replaces a message in place rather than appending.
    const onUpdated = (msg: Message) => {
      setMessages((prev) => prev.map((m) => (m._id === msg._id ? msg : m)));
    };
    socket.on("message:new", onMessage);
    socket.on("message:updated", onUpdated);
    return () => {
      socket.off("message:new", onMessage);
      socket.off("message:updated", onUpdated);
    };
  }, [activeId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  // Join the open thread's room, and re-join it after any reconnect. A bare
  // emit only holds until the first disconnect — a reconnect is a new socket
  // with no room memberships. Same helper every other live view uses.
  useEffect(() => {
    if (!activeId) return;
    return subscribeWithReconnect("chat:join", activeId, (message) =>
      toast.error(message || "Lost access to that conversation")
    );
  }, [activeId]);

  const submitEdit = async (id: string, newText: string) => {
    try {
      await api.patch(`/chat/messages/${id}`, { text: newText });
      // No local update: the server broadcasts "message:updated", which the
      // listener above applies.
    } catch (err) {
      toast.error(getErrorMessage(err, "Couldn't edit that message"));
    }
  };

  const unsend = async (id: string) => {
    if (!window.confirm("Unsend this message? Others will see that it was deleted.")) return;
    try {
      await api.delete(`/chat/messages/${id}`);
    } catch (err) {
      toast.error(getErrorMessage(err, "Couldn't unsend that message"));
    }
  };

  const openConversation = async (id: string) => {
    setActiveId(id);
    try {
      const res = await api.get(`/chat/conversations/${id}/messages`);
      setMessages(res.data.messages);
      // The room is joined by the effect keyed on activeId, not here — see
      // the note there. setActiveId above is what triggers it.
    } catch {
      toast.error("Failed to load messages");
    }
  };

  const handleSend = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !activeId) return;

    // The "message:new" broadcast includes the sender's own socket (room
    // broadcast, not sender-excluded), so the listener above already adds
    // it — appending here too would show every sent message twice.
    getSocket().emit(
      "message:send",
      { conversationId: activeId, text },
      (ack: { success: boolean; message?: string }) => {
        if (!ack?.success) toast.error(ack?.message || "Failed to send message");
      }
    );
    setText("");
  };

  const otherParty = (c: Conversation) =>
    c.participants.find((p) => p._id !== myId) || c.participants[0];

  const conversationLabel = (c: Conversation) => {
    // Channel threads carry a server-computed label ("Ram Thapa — Support"),
    // since their only participant is the owner.
    if (c.label) return c.label;
    const other = otherParty(c);
    return other ? `${other.firstname} ${other.lastname}` : "Conversation";
  };

  /**
   * The role to show beside a thread. On a channel thread the counterpart is
   * the owner rather than a second participant.
   */
  const counterpartRole = (c: Conversation) => c.owner?.role ?? otherParty(c)?.role;

  // Staff threads are ones this account can start; user threads only ever
  // exist because the owner wrote in first, which is why they get the
  // "they'll show up once they message you" empty state and staff don't.
  const isStaff = (role?: string) => Boolean(role) && role !== "user";
  const staffThreads = conversations.filter((c) => isStaff(counterpartRole(c)));
  const userThreads = conversations.filter((c) => !isStaff(counterpartRole(c)));

  const rolesAvailable = [...new Set(staff.map((s) => s.role))];
  const peopleInRole = staff.filter((s) => s.role === newRole);

  const startConversation = async (recipientId: string) => {
    if (!recipientId) return;
    setStarting(true);
    try {
      const res = await api.post("/chat/conversations", { recipientId });
      await loadConversations();
      openConversation(res.data.conversation._id);
      setNewRole("");
      setNewPersonId("");
      setNewCustomerId("");
    } catch (err) {
      toast.error(getErrorMessage(err, "Couldn't start that conversation"));
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="adm-page">
      <div className="adm-page-head"><h2>Chat</h2></div>

      {loading ? (
        <p className="adm-empty">Loading...</p>
      ) : (
        <div className="adm-chat-layout">
          <div className="adm-chat-list">
            <div className="adm-chat-new">
              <span className="adm-chat-group-head">Message a colleague</span>
              <select
                value={newRole}
                onChange={(e) => { setNewRole(e.target.value); setNewPersonId(""); }}
              >
                <option value="">Select a role...</option>
                {rolesAvailable.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>
                ))}
              </select>
              {newRole && (
                <select value={newPersonId} onChange={(e) => setNewPersonId(e.target.value)}>
                  <option value="">Select a person...</option>
                  {peopleInRole.map((p) => (
                    <option key={p._id} value={p._id}>{p.firstname} {p.lastname}</option>
                  ))}
                </select>
              )}
              {newPersonId && (
                <button className="add-btn" onClick={() => startConversation(newPersonId)} disabled={starting}>
                  {starting ? "Starting..." : "Start chat"}
                </button>
              )}
            </div>

            {/* Workshop-admins only. Customers who booked at their garage are
                the one group of non-staff they may contact first. */}
            {customers.length > 0 && (
              <div className="adm-chat-new">
                <span className="adm-chat-group-head">Message a customer</span>
                <select value={newCustomerId} onChange={(e) => setNewCustomerId(e.target.value)}>
                  <option value="">Select a customer...</option>
                  {customers.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.firstname} {c.lastname} — {c.lastService}
                    </option>
                  ))}
                </select>
                {newCustomerId && (
                  <button className="add-btn" onClick={() => startConversation(newCustomerId)} disabled={starting}>
                    {starting ? "Starting..." : "Start chat"}
                  </button>
                )}
              </div>
            )}

            <span className="adm-chat-group-head">Team</span>
            {staffThreads.length === 0 && <p className="adm-empty adm-chat-empty">No staff conversations yet.</p>}
            {staffThreads.map((c) => (
              <div
                key={c._id}
                className={`adm-chat-list-item ${activeId === c._id ? "active" : ""}`}
                onClick={() => openConversation(c._id)}
              >
                {conversationLabel(c)}
                <em className="adm-chat-role">{ROLE_LABELS[counterpartRole(c) ?? ""] ?? counterpartRole(c)}</em>
              </div>
            ))}

            <span className="adm-chat-group-head">Users</span>
            {userThreads.length === 0 && (
              <p className="adm-empty adm-chat-empty">
                No conversations yet — users will show up here once they message you.
              </p>
            )}
            {userThreads.map((c) => (
              <div
                key={c._id}
                className={`adm-chat-list-item ${activeId === c._id ? "active" : ""}`}
                onClick={() => openConversation(c._id)}
              >
                {conversationLabel(c)}
              </div>
            ))}
          </div>

          <div className="adm-chat-thread">
            {!activeId ? (
              <p className="adm-empty" style={{ margin: "auto" }}>Select a conversation</p>
            ) : (
              <>
                <div className="adm-chat-messages" ref={scrollRef}>
                  {messages.map((m) => (
                    <MessageBubble
                      key={m._id}
                      message={m}
                      mine={m.sender === myId}
                      prefix="adm"
                      onEdit={submitEdit}
                      onUnsend={unsend}
                    />
                  ))}
                </div>
                <form className="adm-chat-input-row" onSubmit={handleSend}>
                  <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message..." />
                  <button className="add-btn" type="submit">Send</button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminChatPage;
