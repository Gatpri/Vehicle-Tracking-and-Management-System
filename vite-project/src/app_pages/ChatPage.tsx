import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import api, { getErrorMessage } from "../lib/api";
import { getSocket } from "../lib/socket";
import { useAuth } from "../lib/AuthContext";
import { MessageBubble, type ChatMessage as Message } from "../components/MessageBubble";

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
   * Server-computed name. A channel thread has no second participant to name
   * itself after, and what it should say differs by viewer — the customer sees
   * "Customer Support", the admin answering sees who wrote in.
   */
  label?: string | null;
  channel?: string | null;
}

/** A group a user may write to, from GET /chat/channels. */
interface Channel {
  channel: string;
  workshop?: string;
  label: string;
  description?: string;
}

function ChatPage() {
  const { user: me } = useAuth();
  const [searchParams] = useSearchParams();
  // /api/me returns the id as "id", not "_id" — comparing against the wrong
  // field silently always fails, which breaks both "mine vs theirs" bubble
  // styling and the other-party lookup.
  const myId = me?.id;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  /**
   * The open thread's title, held separately rather than read out of
   * `conversations`. The list only carries workshops the customer has actually
   * messaged, so a thread opened from a workshop page or from "Start a chat"
   * is legitimately absent from it until the first message is sent.
   */
  const [activeTitle, setActiveTitle] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadConversations = async () => {
    try {
      // Channels replace the old raw admin list: a customer writes to
      // "Customer Support" rather than picking one admin by name, and the
      // server decides which groups they may reach.
      const [convoRes, channelRes] = await Promise.all([
        api.get("/chat/conversations"),
        api.get("/chat/channels"),
      ]);
      setConversations(convoRes.data.conversations);
      setChannels(channelRes.data.channels);
    } catch {
      toast.error("Failed to load conversations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initial = async () => {
      await loadConversations();
      // Arriving from a workshop's "Chat with this workshop" button, which
      // opens the thread and then links here with its id — without this the
      // customer would land on an empty pane and have to find it themselves.
      const requested = searchParams.get("conversation");
      if (requested) openConversation(requested);
    };
    initial();
    // searchParams is intentionally not a dependency: this should run on
    // mount, not every time the query string is rewritten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const socket = getSocket();
    const onMessage = (msg: Message) => {
      if (msg.conversation === activeId) {
        setMessages((prev) => [...prev, msg]);
      }
      // The list is keyed on real activity now — a workshop thread only
      // appears once it carries a message — so the first message sent in a
      // freshly opened thread is exactly when the sidebar needs rebuilding.
      // It also reorders the list by recency for messages in other threads.
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

  const openConversation = async (id: string, title?: string) => {
    setActiveId(id);
    try {
      const res = await api.get(`/chat/conversations/${id}/messages`);
      setMessages(res.data.messages);
      // A caller that knows the name (a channel click) passes it; otherwise it
      // comes from the list row that was clicked. The server labels the thread
      // either way, so falling back to its own label covers the deep link from
      // a workshop page, where neither is available.
      setActiveTitle(
        title ??
          conversationLabel(conversations.find((c) => c._id === id)) ??
          res.data.conversationLabel ??
          "Conversation"
      );
      getSocket().emit("chat:join", id);
    } catch {
      toast.error("Failed to load messages");
    }
  };

  const openChannel = async (ch: Channel) => {
    try {
      // Reopening a channel returns the same thread rather than starting a new
      // one, so this is safe to click repeatedly.
      const res = await api.post("/chat/channels/open", {
        channel: ch.channel,
        workshopId: ch.workshop,
      });
      await loadConversations();
      // The channel's own name titles the thread — it may not be listed below.
      openConversation(res.data.conversation._id, ch.label);
    } catch {
      toast.error("Failed to open that channel");
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

  const submitEdit = async (id: string, newText: string) => {
    try {
      await api.patch(`/chat/messages/${id}`, { text: newText });
      // No local update: the server broadcasts "message:updated", which the
      // listener above applies — doing both would fight each other.
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

  const conversationLabel = (c?: Conversation) => {
    if (!c) return undefined;
    // Channel threads carry a server-computed label — they have no second
    // participant, and the right name depends on which side you are on.
    if (c.label) return c.label;
    const other = c.participants.find((p) => p._id !== myId) || c.participants[0];
    return other ? `${other.firstname} ${other.lastname}` : "Conversation";
  };

  if (loading) return <div className="uh-page"><p>Loading...</p></div>;

  return (
    <div className="uh-page">
      <h1 style={{ marginBottom: 20 }}>Chat</h1>
      <div className="ap-chat-layout">
        <div className="ap-chat-list">
          {channels.length > 0 && (
            <>
              <div className="ap-section-title" style={{ margin: "0 0 6px" }}>Start a chat</div>
              {channels.map((ch) => (
                <div
                  key={`${ch.channel}:${ch.workshop ?? ""}`}
                  className="ap-chat-list-item"
                  onClick={() => openChannel(ch)}
                >
                  <div>{ch.label}</div>
                  {ch.description && (
                    <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{ch.description}</div>
                  )}
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
              onClick={() => openConversation(c._id, conversationLabel(c))}
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
              {activeTitle && <div className="ap-chat-thread-head">{activeTitle}</div>}
              <div className="ap-chat-messages" ref={scrollRef}>
                {messages.map((m) => (
                  <MessageBubble
                    key={m._id}
                    message={m}
                    mine={m.sender === myId}
                    prefix="ap"
                    onEdit={submitEdit}
                    onUnsend={unsend}
                  />
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
