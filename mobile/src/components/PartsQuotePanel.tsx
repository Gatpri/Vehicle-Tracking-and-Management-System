import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import api, { getErrorMessage } from "../lib/api";
import { getSocket } from "../lib/socket";
import { Card, Heading, Muted, Button, Badge, Field, Loading, Row } from "./ui";
import { colors, radius, spacing } from "../theme";
import { formatMoney, formatDateTime } from "../lib/types";

/**
 * Parts estimation — the mobile counterpart of the web PartsQuotePanel.
 *
 * The negotiation is a back-and-forth, not a single price:
 *
 *   workshop  → estimate      a list of parts and prices
 *   customer  → enquiry       a question, agreeing to nothing
 *   workshop  → reply         an answer, list unchanged
 *   customer  → accept        either the full list, or only the parts kept
 *   workshop  → confirm       fixes the price; this is the binding step
 *
 * A garage that opens the engine and finds something worse can send another
 * estimate, which starts a new round. Prices are paisa on the wire and rupees
 * in the inputs, matching the rest of the app.
 */
interface QuoteItem {
  part: string;
  /** Paisa. */
  price: number;
  selected?: boolean;
}

interface Revision {
  authorRole: "workshop" | "customer";
  action: "estimate" | "reply" | "confirm" | "accept-selection" | "accept-as-estimated" | "enquiry";
  round: number;
  note?: string;
  items?: QuoteItem[];
  voiceUrl?: string;
  createdAt: string;
}

interface Quote {
  _id: string;
  status: "awaiting-customer" | "awaiting-workshop" | "accepted" | "cancelled";
  currentRound: number;
  revisions: Revision[];
  pendingAcceptance?: { total: number | null; mode: "selection" | "as-estimated" | null; at: string | null };
  agreedTotal?: number;
}

const ACTION_LABEL: Record<Revision["action"], string> = {
  estimate: "Estimate",
  reply: "Reply",
  confirm: "Price confirmed",
  "accept-selection": "Accepted (selected parts)",
  "accept-as-estimated": "Accepted in full",
  enquiry: "Question",
};

export function PartsQuotePanel({
  bookingId,
  side,
}: {
  bookingId: string;
  /** Which half of the negotiation this user is on. */
  side: "customer" | "workshop";
}) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState("");
  /**
   * Collapsed by default. Opened automatically once — and only once — when the
   * negotiation is waiting on this side, so a customer scrolling their
   * bookings sees the estimate that needs answering without hunting for it,
   * while the rest stay out of the way.
   */
  const [open, setOpen] = useState(false);
  const autoOpened = useRef(false);

  // Workshop: the estimate being composed. Prices are typed in rupees.
  const [draft, setDraft] = useState<{ part: string; price: string }[]>([{ part: "", price: "" }]);
  const [composing, setComposing] = useState(false);

  // Customer: which parts they are willing to pay for. Defaults to all, since
  // the common case is accepting the list as given.
  const [picked, setPicked] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/bookings/${bookingId}/quote`);
      const q: Quote | null = res.data.quote ?? null;
      setQuote(q);

      const latestItems = [...(q?.revisions ?? [])].reverse().find((r) => r.items?.length)?.items ?? [];
      setPicked(Object.fromEntries(latestItems.map((i) => [i.part, true])));
    } catch {
      // No quote yet is the normal state before a workshop estimates.
      setQuote(null);
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * The other side sending a revision should appear without a pull-to-refresh —
   * this is a conversation, and a stale price is worse than no price.
   *
   * There is no dedicated quote event: quoteController.js notifies the other
   * party through notificationService, which emits "notification:new" to their
   * `user:<id>` room, and moves the booking status (emitting
   * "booking:updated"). Refetching on either is what keeps this panel current.
   */
  useEffect(() => {
    const socket = getSocket();
    const onUpdate = () => load();
    socket.on("notification:new", onUpdate);
    socket.on("booking:updated", onUpdate);
    return () => {
      socket.off("notification:new", onUpdate);
      socket.off("booking:updated", onUpdate);
    };
  }, [load]);

  const latest = [...(quote?.revisions ?? [])].reverse().find((r) => r.items?.length);
  const items = latest?.items ?? [];
  const fullTotal = items.reduce((sum, i) => sum + i.price, 0);
  const pickedTotal = items.filter((i) => picked[i.part]).reduce((sum, i) => sum + i.price, 0);
  const droppedAny = pickedTotal !== fullTotal;
  const awaitingConfirm = quote?.pendingAcceptance?.total != null;

  const sendWorkshopEstimate = async () => {
    const parsed = draft
      .filter((r) => r.part.trim())
      // Rupees in, paisa out — the same convention as every other price here.
      .map((r) => ({ part: r.part.trim(), price: Math.round((Number(r.price) || 0) * 100) }));

    if (parsed.length === 0) {
      Alert.alert("Nothing to send", "Add at least one part.");
      return;
    }

    setSending(true);
    try {
      const form = new FormData();
      form.append("items", JSON.stringify(parsed));
      form.append("note", note);
      await api.post(`/bookings/${bookingId}/quote/workshop`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setNote("");
      setDraft([{ part: "", price: "" }]);
      setComposing(false);
      load();
    } catch (err) {
      Alert.alert("Could not send", getErrorMessage(err, "The estimate was not sent."));
    } finally {
      setSending(false);
    }
  };

  /**
   * One endpoint, three meanings. An enquiry deliberately commits to nothing,
   * so a question can never be read as agreement.
   */
  const sendCustomer = async (action: "accept-selection" | "accept-as-estimated" | "enquiry") => {
    if (action === "enquiry" && !note.trim()) {
      Alert.alert("Add a question", "Type what you want to ask the workshop.");
      return;
    }
    setSending(true);
    try {
      const form = new FormData();
      form.append("action", action);
      form.append("selectedParts", JSON.stringify(Object.keys(picked).filter((p) => picked[p])));
      form.append("note", note);
      await api.post(`/bookings/${bookingId}/quote/customer`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setNote("");
      Alert.alert(
        action === "enquiry" ? "Question sent" : "Accepted",
        action === "enquiry"
          ? "The workshop will reply."
          : "Waiting for the workshop to confirm the price."
      );
      load();
    } catch (err) {
      Alert.alert("Could not send", getErrorMessage(err, "Your response was not sent."));
    } finally {
      setSending(false);
    }
  };

  /** Workshop answering a question — list and price untouched. */
  const sendReply = async () => {
    if (!note.trim()) {
      Alert.alert("Add a reply", "Type your answer to the customer.");
      return;
    }
    setSending(true);
    try {
      const form = new FormData();
      form.append("note", note);
      await api.post(`/bookings/${bookingId}/quote/reply`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setNote("");
      load();
    } catch (err) {
      Alert.alert("Could not reply", getErrorMessage(err, "Please try again."));
    } finally {
      setSending(false);
    }
  };

  /** Only the workshop confirms — this is the step that fixes the price. */
  const confirm = async () => {
    setSending(true);
    try {
      await api.post(`/bookings/${bookingId}/quote/confirm`, { note });
      setNote("");
      Alert.alert("Price confirmed", "The customer can now pay this amount.");
      load();
    } catch (err) {
      Alert.alert("Could not confirm", getErrorMessage(err, "Please try again."));
    } finally {
      setSending(false);
    }
  };

  const myTurn =
    (side === "customer" && quote?.status === "awaiting-customer") ||
    (side === "workshop" && quote?.status === "awaiting-workshop");

  // Declared BEFORE the early return below — a hook after a conditional return
  // runs on some renders and not others, which React rejects outright.
  //
  // Guarded by a ref so a later refetch cannot reopen a panel the user has
  // deliberately collapsed.
  useEffect(() => {
    if (myTurn && !autoOpened.current) {
      autoOpened.current = true;
      setOpen(true);
    }
  }, [myTurn]);

  if (loading) return <Loading label="Loading estimate…" />;

  return (
    <Card>
      {/* The whole header toggles — the panel is tall, and a booking list with
          several of them expanded is unreadable. */}
      <Pressable onPress={() => setOpen((o) => !o)}>
        <View style={styles.head}>
          <View style={styles.headMain}>
            <Heading level={2}>Parts estimate</Heading>
            {/* A summary while collapsed, so the row still says something
                useful without being opened. */}
            {!open ? (
              <Muted>
                {items.length === 0
                  ? "No estimate yet"
                  : `${items.length} part${items.length === 1 ? "" : "s"} · ${formatMoney(
                      quote?.agreedTotal || fullTotal
                    )}`}
              </Muted>
            ) : null}
          </View>
          {quote ? <Badge status={quote.status} /> : null}
          <Text style={styles.chevron}>{open ? "▲" : "▼"}</Text>
        </View>
      </Pressable>

      {/* Everything below is hidden while collapsed. */}
      {!open ? null : (
        <>
      {!quote ? (
        <Muted>
          {side === "workshop"
            ? "No estimate yet. Send one once you have opened the vehicle."
            : "The workshop has not sent an estimate yet."}
        </Muted>
      ) : null}

      {/* Current list, with the customer able to drop parts they will not pay
          for — accepting a subset is a real outcome, not an edge case. */}
      {items.length > 0 ? (
        <View style={styles.items}>
          {items.map((i) => {
            const on = picked[i.part] !== false;
            const selectable = side === "customer" && quote?.status === "awaiting-customer";
            return (
              <Pressable
                key={i.part}
                disabled={!selectable}
                onPress={() => setPicked((p) => ({ ...p, [i.part]: !on }))}
              >
                <View style={[styles.item, selectable && !on && styles.itemOff]}>
                  <Text style={[styles.itemName, !on && styles.itemNameOff]}>
                    {selectable ? (on ? "☑ " : "☐ ") : ""}
                    {i.part}
                  </Text>
                  <Text style={[styles.itemPrice, !on && styles.itemNameOff]}>{formatMoney(i.price)}</Text>
                </View>
              </Pressable>
            );
          })}

          <Row label="Full estimate" value={formatMoney(fullTotal)} />
          {side === "customer" && droppedAny ? (
            <Row label="Your selection" value={formatMoney(pickedTotal)} />
          ) : null}
          {quote?.agreedTotal ? <Row label="Agreed" value={formatMoney(quote.agreedTotal)} /> : null}
        </View>
      ) : null}

      {/* History — who said what, so a price is never a bare number. */}
      {(quote?.revisions ?? []).length > 0 ? (
        <View style={styles.history}>
          {(quote?.revisions ?? []).map((r, i) => (
            <View key={i} style={styles.revision}>
              <Text style={styles.revisionHead}>
                {r.authorRole === "workshop" ? "Workshop" : "You"} · {ACTION_LABEL[r.action]}
                {r.round ? ` · round ${r.round}` : ""}
              </Text>
              {r.note ? <Text style={styles.revisionNote}>{r.note}</Text> : null}
              <Text style={styles.revisionTime}>{formatDateTime(r.createdAt)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {quote?.status === "accepted" ? (
        <Muted>This estimate is settled. Nothing further to do here.</Muted>
      ) : (
        <View style={styles.actions}>
          <Field
            label={side === "workshop" ? "Note to the customer" : "Note or question"}
            value={note}
            onChangeText={setNote}
            placeholder={side === "workshop" ? "e.g. the chain also needs replacing" : "e.g. is the brake pad necessary?"}
            multiline
            numberOfLines={2}
            autoCapitalize="sentences"
          />

          {side === "customer" ? (
            <>
              {myTurn ? (
                <>
                  <Button
                    title={droppedAny ? `Accept selected — ${formatMoney(pickedTotal)}` : `Accept — ${formatMoney(fullTotal)}`}
                    onPress={() => sendCustomer(droppedAny ? "accept-selection" : "accept-as-estimated")}
                    loading={sending}
                    disabled={items.length === 0}
                  />
                  <Button title="Ask a question" variant="outline" onPress={() => sendCustomer("enquiry")} disabled={sending} />
                </>
              ) : (
                <Muted>
                  {awaitingConfirm
                    ? "Waiting for the workshop to confirm the price."
                    : "Waiting for the workshop."}
                </Muted>
              )}
            </>
          ) : (
            <>
              {/* The workshop can always start a new round — that is what
                  happens when opening the vehicle reveals more work. */}
              {composing ? (
                <View style={styles.draft}>
                  {draft.map((row, idx) => (
                    <View key={idx} style={styles.draftRow}>
                      <View style={styles.draftPart}>
                        <Field
                          label="Part"
                          value={row.part}
                          onChangeText={(v) =>
                            setDraft((d) => d.map((r, i) => (i === idx ? { ...r, part: v } : r)))
                          }
                          placeholder="Brake pad"
                          autoCapitalize="sentences"
                        />
                      </View>
                      <View style={styles.draftPrice}>
                        <Field
                          label="Rs"
                          value={row.price}
                          onChangeText={(v) =>
                            setDraft((d) => d.map((r, i) => (i === idx ? { ...r, price: v } : r)))
                          }
                          placeholder="1200"
                          keyboardType="number-pad"
                        />
                      </View>
                    </View>
                  ))}
                  <Button
                    title="Add another part"
                    variant="ghost"
                    small
                    onPress={() => setDraft((d) => [...d, { part: "", price: "" }])}
                  />
                  <Button title="Send estimate" onPress={sendWorkshopEstimate} loading={sending} />
                  <Button title="Cancel" variant="ghost" small onPress={() => setComposing(false)} />
                </View>
              ) : (
                <>
                  {awaitingConfirm ? (
                    <Button
                      title={`Confirm ${formatMoney(quote?.pendingAcceptance?.total ?? 0)}`}
                      onPress={confirm}
                      loading={sending}
                    />
                  ) : null}
                  {myTurn && !awaitingConfirm ? (
                    <Button title="Reply to the customer" onPress={sendReply} loading={sending} />
                  ) : null}
                  <Button
                    title={items.length > 0 ? "Send a revised estimate" : "Send an estimate"}
                    variant={items.length > 0 ? "outline" : "primary"}
                    onPress={() => setComposing(true)}
                    disabled={sending}
                  />
                </>
              )}
            </>
          )}
        </View>
      )}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.md },
  headMain: { flex: 1, gap: 2 },
  chevron: { color: colors.slate400, fontSize: 12 },
  items: { marginTop: spacing.md, gap: 2 },
  item: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    gap: spacing.md,
  },
  itemOff: { backgroundColor: colors.slate100 },
  itemName: { color: colors.navy900, fontSize: 14, flex: 1 },
  itemNameOff: { color: colors.slate400, textDecorationLine: "line-through" },
  itemPrice: { color: colors.slate600, fontWeight: "700", fontSize: 14 },
  history: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.slate100,
    gap: spacing.md,
  },
  revision: { gap: 2 },
  revisionHead: { fontSize: 13, fontWeight: "700", color: colors.navy900 },
  revisionNote: { fontSize: 13, color: colors.slate600, lineHeight: 19 },
  revisionTime: { fontSize: 11, color: colors.slate400 },
  actions: { marginTop: spacing.lg, gap: spacing.md },
  draft: { gap: spacing.md },
  draftRow: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  draftPart: { flex: 2 },
  draftPrice: { flex: 1 },
});
