import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "react-toastify";
import api from "../lib/api";
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

  const conversationLabel = (c: Conversation) => {
    const other = c.participants.find((p) => p._id !== myId) || c.participants[0];
    return other ? `${other.firstname} ${other.lastname}` : "Conversation";
  };

  return (
    <div className="adm-page">
      <div className="adm-page-head"><h2>Chat</h2></div>

      {loading ? (
        <p className="adm-empty">Loading...</p>
      ) : (
        <div className="adm-chat-layout">
          <div className="adm-chat-list">
            {conversations.length === 0 && <p className="adm-empty">No conversations yet — users will show up here once they message you.</p>}
            {conversations.map((c) => (
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
