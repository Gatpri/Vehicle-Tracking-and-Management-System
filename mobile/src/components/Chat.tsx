import { useEffect, useRef, useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import api, { getErrorMessage } from "../lib/api";
import { getSocket, subscribeWithReconnect } from "../lib/socket";
import { useAuth } from "../lib/AuthContext";
import { Card, Heading, Muted, Loading, ErrorNote, Empty } from "./ui";
import { colors, radius, spacing } from "../theme";
import { canStillEdit, formatDateTime, type ChatChannel, type Conversation, type Message } from "../lib/types";

/**
 * The chat UI, shared by the customer, admin and staff areas — all three used
 * a near-identical page on the web (ChatPage.tsx and AdminChatPage.tsx), so
 * this exists once and takes the difference as a prop.
 *
 * Two behaviours are carried over deliberately from the web version:
 *
 *   Messages are sent over the socket, not through the REST route, because
 *   that is what the server's "message:send" handler acknowledges.
 *
 *   Nothing is appended locally on send. The server's "message:new" broadcast
 *   is a room broadcast that includes the sender's own socket, so the listener
 *   below already adds it — appending here as well would show every sent
 *   message twice. That comment is in the web file too; it is the kind of
 *   thing that looks like a missing line until you know why.
 */
export function Chat({
  title,
  emptyHint,
}: {
  title: string;
  emptyHint: string;
}) {
  const { user } = useAuth();
  const myId = user?.id;

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  /**
   * The open thread's title, held separately rather than looked up in
   * `conversations`. A customer's list only carries the workshops they have
   * messaged, so a freshly opened Support or Vehicle Tracking thread is not in
   * it — looking the title up there would leave the header blank.
   */
  const [activeTitle, setActiveTitle] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** The message currently open in the edit sheet, if any. */
  const [editing, setEditing] = useState<Message | null>(null);
  const [editDraft, setEditDraft] = useState("");
  /** Which edited messages have had their history expanded. */
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set());
  const listRef = useRef<FlatList<Message>>(null);

  const loadConversations = async () => {
    try {
      // Channels are the groups this user may write to — "Customer Support",
      // "Vehicle Tracking", each workshop. The server decides which are
      // offered, so the two clients cannot disagree about who may talk to whom.
      const [convoRes, channelRes] = await Promise.all([
        api.get("/chat/conversations"),
        api.get("/chat/channels"),
      ]);
      setConversations(convoRes.data.conversations ?? []);
      setChannels(channelRes.data.channels ?? []);
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err, "Could not load your conversations."));
    } finally {
      setLoading(false);
    }
  };

  const openChannel = async (ch: ChatChannel) => {
    try {
      // Reopening a channel returns the same thread rather than creating a
      // new one, so this is safe to tap repeatedly.
      const res = await api.post("/chat/channels/open", {
        channel: ch.channel,
        workshopId: ch.workshop,
      });
      await loadConversations();
      // The channel's own name titles the thread — it may not be in the list.
      openConversation(res.data.conversation._id, ch.label);
    } catch (err) {
      setError(getErrorMessage(err, "Could not open that channel."));
    }
  };

  useEffect(() => {
    loadConversations();
  }, []);

  // Incoming messages. Filtered by conversation because the socket delivers
  // every room this user belongs to, not just the open one.
  useEffect(() => {
    const socket = getSocket();
    const onMessage = (msg: Message) => {
      if (msg.conversation === activeId) {
        setMessages((prev) => [...prev, msg]);
      }
      // A message in another thread still changes the list ordering and
      // preview, so the sidebar is refreshed either way.
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

  // Re-join the room on every reconnect. On the web this mattered rarely; on a
  // phone the socket drops whenever the app is backgrounded or the network
  // switches, and without this the thread would go quiet with no visible cause.
  useEffect(() => {
    if (!activeId) return;
    return subscribeWithReconnect("chat:join", activeId);
  }, [activeId]);

  const openConversation = async (id: string, title?: string) => {
    setActiveId(id);
    setActiveTitle(title ?? label(conversations.find((c) => c._id === id)));
    setMessages([]);
    try {
      const res = await api.get(`/chat/conversations/${id}/messages`);
      setMessages(res.data.messages ?? []);
    } catch (err) {
      setError(getErrorMessage(err, "Could not load these messages."));
    }
  };

  const send = () => {
    const body = text.trim();
    if (!body || !activeId) return;

    // Cleared up front so the input feels immediate; the message itself
    // arrives back through the broadcast.
    setText("");
    getSocket().emit(
      "message:send",
      { conversationId: activeId, text: body },
      (ack: { success: boolean; message?: string } | undefined) => {
        if (!ack?.success) {
          setError(ack?.message || "That message did not send.");
          // Put the text back so it is not silently lost.
          setText(body);
        }
      }
    );
  };

  /**
   * Long-press menu for your own message. Edit only appears inside the
   * 3-minute window; unsend is always available.
   */
  const showActions = (m: Message) => {
    const options: Parameters<typeof Alert.alert>[2] = [];

    if (canStillEdit(m)) {
      options.push({
        text: "Edit",
        onPress: () => {
          setEditing(m);
          setEditDraft(m.text ?? "");
        },
      });
    }

    options.push({
      text: "Unsend",
      style: "destructive",
      onPress: () =>
        Alert.alert("Unsend this message?", "Others will see that it was deleted.", [
          { text: "Keep", style: "cancel" },
          { text: "Unsend", style: "destructive", onPress: () => unsend(m._id) },
        ]),
    });

    options.push({ text: "Cancel", style: "cancel" });
    Alert.alert("Message", undefined, options);
  };

  const unsend = (id: string) => {
    getSocket().emit("message:unsend", { messageId: id }, (ack: { success: boolean; message?: string } | undefined) => {
      // No local update: the server broadcasts "message:updated", which the
      // listener above applies.
      if (!ack?.success) setError(ack?.message || "That message could not be unsent.");
    });
  };

  const submitEdit = () => {
    const body = editDraft.trim();
    if (!editing || !body) return;
    getSocket().emit(
      "message:edit",
      { messageId: editing._id, text: body },
      (ack: { success: boolean; message?: string } | undefined) => {
        if (!ack?.success) setError(ack?.message || "That message could not be edited.");
      }
    );
    setEditing(null);
    setEditDraft("");
  };

  const label = (c?: Conversation) => {
    if (!c) return "Conversation";
    // Channel threads carry a server-computed label — they have no second
    // participant, and the right name depends on which side you are on.
    if (c.label) return c.label;
    const other = (c.participants ?? []).find((p) => p._id !== myId) || (c.participants ?? [])[0];
    return other ? `${other.firstname ?? ""} ${other.lastname ?? ""}`.trim() || "Conversation" : "Conversation";
  };

  if (loading) return <Loading label="Loading conversations…" />;

  // Thread view — a phone cannot show the list and the thread side by side the
  // way the web page did, so opening a conversation replaces the list and the
  // back control returns to it.
  if (activeId) {
    return (
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <View style={styles.threadHead}>
          <Pressable onPress={() => setActiveId(null)} hitSlop={12}>
            <Text style={styles.back}>‹ Back</Text>
          </Pressable>
          <Text style={styles.threadTitle} numberOfLines={1}>
            {activeTitle}
          </Text>
        </View>

        {error ? <ErrorNote message={error} /> : null}

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m._id}
          contentContainerStyle={styles.messages}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => {
            const senderId = typeof item.sender === "object" ? item.sender?._id : item.sender;
            const mine = senderId === myId;
            const showingHistory = expandedHistory.has(item._id);

            // An unsent message keeps its row so replies still make sense, but
            // shows a placeholder instead of the text.
            if (item.deletedAt) {
              return (
                <View style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
                  <View style={[styles.bubble, styles.bubbleDeleted]}>
                    <Text style={styles.deletedText}>This message was deleted</Text>
                  </View>
                </View>
              );
            }

            return (
              <View style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  {mine ? (
                    // An explicit ⋮ rather than a long-press: a hidden gesture
                    // is undiscoverable, so people never learn the actions are
                    // there at all.
                    <Pressable
                      onPress={() => showActions(item)}
                      hitSlop={10}
                      style={styles.dots}
                      accessibilityLabel="Message actions"
                    >
                      <Text style={[styles.dotsText, mine && styles.bubbleTextMine]}>⋮</Text>
                    </Pressable>
                  ) : null}

                  <View>
                    <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{item.text}</Text>

                    <View style={styles.bubbleMeta}>
                      <Text style={[styles.bubbleTime, mine && styles.bubbleTimeMine]}>
                        {formatDateTime(item.createdAt)}
                      </Text>
                      {item.editedAt ? (
                        <Text
                          onPress={() =>
                            setExpandedHistory((prev) => {
                              const next = new Set(prev);
                              if (next.has(item._id)) next.delete(item._id);
                              else next.add(item._id);
                              return next;
                            })
                          }
                          style={[styles.editedTag, mine && styles.bubbleTimeMine]}
                        >
                          {" · edited"}
                        </Text>
                      ) : null}
                    </View>

                    {showingHistory && (item.editHistory?.length ?? 0) > 0 ? (
                      <View style={[styles.history, mine && styles.historyMine]}>
                        {item.editHistory!.map((h, i) => (
                          <Text
                            key={i}
                            style={[styles.historyText, mine && styles.bubbleTimeMine]}
                          >
                            {h.text}
                          </Text>
                        ))}
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={<Empty message="No messages yet. Say hello." />}
        />

        <View style={styles.composer}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Type a message"
            placeholderTextColor={colors.slate400}
            style={styles.input}
            multiline
            onSubmitEditing={send}
          />
          <Pressable onPress={send} style={styles.sendBtn} disabled={!text.trim()}>
            <Text style={styles.sendText}>Send</Text>
          </Pressable>
        </View>

        <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
          <View style={styles.backdrop}>
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>Edit message</Text>
              <TextInput
                value={editDraft}
                onChangeText={setEditDraft}
                style={styles.input}
                multiline
                autoFocus
              />
              <View style={styles.sheetActions}>
                <Pressable onPress={() => setEditing(null)} style={[styles.sheetBtn, styles.sheetBtnGhost]}>
                  <Text style={styles.sheetBtnGhostText}>Cancel</Text>
                </Pressable>
                <Pressable onPress={submitEdit} style={styles.sheetBtn}>
                  <Text style={styles.sendText}>Save</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.listWrap}>
      <Heading>{title}</Heading>
      {error ? <ErrorNote message={error} onRetry={loadConversations} /> : null}

      <FlatList
        data={conversations}
        keyExtractor={(c) => c._id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          channels.length > 0 ? (
            <View style={styles.channels}>
              <Text style={styles.sectionTitle}>Start a chat</Text>
              {channels.map((ch) => (
                <Pressable key={`${ch.channel}:${ch.workshop ?? ""}`} onPress={() => openChannel(ch)}>
                  <Card style={styles.channelCard}>
                    <Text style={styles.convTitle}>{ch.label}</Text>
                    {ch.description ? <Muted>{ch.description}</Muted> : null}
                  </Card>
                </Pressable>
              ))}
              <Text style={styles.sectionTitle}>Conversations</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => openConversation(item._id)}>
            <Card>
              <Text style={styles.convTitle}>{label(item)}</Text>
              <Muted>{item.lastMessageAt ? formatDateTime(item.lastMessageAt) : "No messages yet"}</Muted>
            </Card>
          </Pressable>
        )}
        ListEmptyComponent={<Empty message={emptyHint} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bgAlt },
  listWrap: { flex: 1, backgroundColor: colors.bgAlt, padding: spacing.lg, gap: spacing.lg },
  listContent: { gap: spacing.md, paddingBottom: spacing.xxl },
  convTitle: { fontWeight: "700", color: colors.navy900, fontSize: 15, marginBottom: 2 },
  channels: { gap: spacing.md, marginBottom: spacing.sm },
  channelCard: { borderColor: colors.blue600 },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: colors.slate600, marginTop: spacing.sm },
  threadHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate200,
  },
  back: { color: colors.blue700, fontWeight: "700", fontSize: 16 },
  threadTitle: { fontWeight: "700", color: colors.navy900, fontSize: 16, flex: 1 },
  messages: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  bubbleRow: { flexDirection: "row" },
  bubbleRowMine: { justifyContent: "flex-end" },
  // paddingRight leaves room for the ⋮ so message text never runs under it.
  bubble: { maxWidth: "80%", padding: spacing.md, paddingRight: 26, borderRadius: radius.md, gap: 4 },
  bubbleMine: { backgroundColor: colors.blue700, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.slate200, borderBottomLeftRadius: 4 },
  bubbleText: { color: colors.slate900, fontSize: 15, lineHeight: 20 },
  bubbleTextMine: { color: "#fff" },
  bubbleTime: { color: colors.slate400, fontSize: 11 },
  bubbleTimeMine: { color: "rgba(255,255,255,0.7)" },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.slate200,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    maxHeight: 120,
    fontSize: 15,
    color: colors.slate900,
  },
  sendBtn: {
    backgroundColor: colors.blue700,
    borderRadius: radius.pill,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  sendText: { color: "#fff", fontWeight: "700" },
  bubbleMeta: { flexDirection: "row", alignItems: "center" },
  // Absolutely positioned so the ⋮ never pushes the text around; the bubble
  // reserves room for it with extra right padding.
  dots: { position: "absolute", top: 4, right: 6, zIndex: 2, paddingHorizontal: 2 },
  dotsText: { fontSize: 16, lineHeight: 18, color: colors.slate400, fontWeight: "700" },
  editedTag: { color: colors.slate400, fontSize: 11, fontStyle: "italic" },
  bubbleDeleted: { backgroundColor: colors.slate100, borderWidth: 1, borderColor: colors.slate200 },
  deletedText: { color: colors.slate400, fontSize: 14, fontStyle: "italic" },
  history: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.slate200,
    gap: 2,
  },
  historyMine: { borderTopColor: "rgba(255,255,255,0.3)" },
  historyText: { fontSize: 12, color: colors.slate600, textDecorationLine: "line-through" },
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  sheetTitle: { fontSize: 18, fontWeight: "700", color: colors.navy900 },
  sheetActions: { flexDirection: "row", gap: spacing.md, justifyContent: "flex-end" },
  sheetBtn: { backgroundColor: colors.blue700, borderRadius: radius.pill, paddingHorizontal: 22, paddingVertical: 12 },
  sheetBtnGhost: { backgroundColor: colors.slate100 },
  sheetBtnGhostText: { color: colors.navy900, fontWeight: "700" },
});
