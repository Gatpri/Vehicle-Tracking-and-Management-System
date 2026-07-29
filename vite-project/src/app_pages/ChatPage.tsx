import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "react-toastify";
import api from "../lib/api";
import { getSocket } from "../lib/socket";
import { getCurrentUser } from "../lib/useAuth";

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
interface Admin {
  _id: string;
  firstname: string;
  lastname: string;
}

function ChatPage() {
  const me = getCurrentUser();
  // The stored user object uses "id" (that's what login/google-auth return),
  // not "_id" — comparing against the wrong field silently always fails,
  // which broke both "mine vs theirs" bubble styling and the other-party lookup.
  const myId = me?._id ?? me?.id;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadConversations = async () => {
    try {
      const [convoRes, adminRes] = await Promise.all([
        api.get("/chat/conversations"),
        api.get("/chat/support-admins"),
      ]);
      setConversations(convoRes.data.conversations);
      setAdmins(adminRes.data.admins);
    } catch {
      toast.error("Failed to load conversations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initial = async () => {
      await loadConversations();
    };
    initial();
  }, []);

  useEffect(() => {
    const socket = getSocket();
    const onMessage = (msg: Message) => {
      if (msg.conversation === activeId) {
        setMessages((prev) => [...prev, msg]);
      }
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

  const startWithAdmin = async (recipientId: string) => {
    try {
      const res = await api.post("/chat/conversations", { recipientId });
      await loadConversations();
      openConversation(res.data.conversation._id);
    } catch {
      toast.error("Failed to start conversation");
    }
  };

  const handleSend = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !activeId) return;

    // Don't append locally here — the server's "message:new" broadcast
    // includes the sender's own socket (it's a room broadcast, not
    // sender-excluded), so the `onMessage` listener above already adds it.
    // Appending here too would show every sent message twice.
    getSocket().emit(
      "message:send",
      { conversationId: activeId, text },
      (ack: { success: boolean; message?: string }) => {
        if (!ack?.success) toast.error(ack?.message || "Failed to send message");
      }
    );
    setText("");
  };

  const conversationLabel = (c: Conversation) => {
    const other = c.participants.find((p) => p._id !== myId) || c.participants[0];
    return other ? `${other.firstname} ${other.lastname}` : "Conversation";
  };

  if (loading) return <div className="uh-page"><p>Loading...</p></div>;

  return (
    <div className="uh-page">
      <h1 style={{ marginBottom: 20 }}>Chat</h1>
      <div className="ap-chat-layout">
        <div className="ap-chat-list">
          {admins.length > 0 && (
            <>
              <div className="ap-section-title" style={{ margin: "0 0 6px" }}>Start a chat</div>
              {admins.map((a) => (
                <div key={a._id} className="ap-chat-list-item" onClick={() => startWithAdmin(a._id)}>
                  {a.firstname} {a.lastname}
                </div>
              ))}
              <div className="ap-section-title" style={{ margin: "16px 0 6px" }}>Conversations</div>
            </>
          )}
          {conversations.length === 0 && <div className="uh-empty">No conversations yet.</div>}
          {conversations.map((c) => (
            <div
              key={c._id}
              className={`ap-chat-list-item ${activeId === c._id ? "active" : ""}`}
              onClick={() => openConversation(c._id)}
            >
              {conversationLabel(c)}
            </div>
          ))}
        </div>

        <div className="ap-chat-thread">
          {!activeId ? (
            <div className="uh-empty" style={{ margin: "auto" }}>Select or start a conversation</div>
          ) : (
            <>
              <div className="ap-chat-messages" ref={scrollRef}>
                {messages.map((m) => (
                  <div key={m._id} className={m.sender === myId ? "ap-msg ap-msg-mine" : "ap-msg ap-msg-theirs"}>
                    {m.text}
                  </div>
                ))}
              </div>
              <form className="ap-chat-input-row" onSubmit={handleSend}>
                <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message..." />
                <button className="uh-btn uh-btn-primary" type="submit">Send</button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default ChatPage;
