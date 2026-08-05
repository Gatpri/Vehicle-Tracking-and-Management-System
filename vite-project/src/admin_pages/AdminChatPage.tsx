import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "react-toastify";
import api, { getErrorMessage } from "../lib/api";
import { getSocket } from "../lib/socket";
import { getCurrentUser } from "../lib/useAuth";
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
}
interface Message {
  _id: string;
  conversation: string;
  sender: string;
  text: string;
  createdAt: string;
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
  const me = getCurrentUser();
  // The stored user object uses "id" (that's what login/google-auth return),
  // not "_id" — comparing against the wrong field silently always fails.
  const myId = me?._id ?? me?.id;
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
    socket.on("message:new", onMessage);
    return () => {
      socket.off("message:new", onMessage);
    };
  }, [activeId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const openConversation = async (id: string) => {
    setActiveId(id);
    try {
      const res = await api.get(`/chat/conversations/${id}/messages`);
      setMessages(res.data.messages);
      getSocket().emit("chat:join", id);
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
    const other = otherParty(c);
    return other ? `${other.firstname} ${other.lastname}` : "Conversation";
  };

  // Staff threads are ones this account can start; user threads only ever
  // exist because the owner wrote in first, which is why they get the
  // "they'll show up once they message you" empty state and staff don't.
  const isStaff = (role?: string) => Boolean(role) && role !== "user";
  const staffThreads = conversations.filter((c) => isStaff(otherParty(c)?.role));
  const userThreads = conversations.filter((c) => !isStaff(otherParty(c)?.role));

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
                <em className="adm-chat-role">{ROLE_LABELS[otherParty(c)?.role ?? ""] ?? otherParty(c)?.role}</em>
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
                    <div key={m._id} className={m.sender === myId ? "adm-msg adm-msg-mine" : "adm-msg adm-msg-theirs"}>
                      {m.text}
                    </div>
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
