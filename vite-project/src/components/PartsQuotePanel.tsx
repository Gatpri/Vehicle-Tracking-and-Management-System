import { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import api, { getErrorMessage } from "../lib/api";
import "./PartsQuotePanel.css";

interface QuoteItem {
  part: string;
  price: number; // paisa
  selected: boolean;
}
type RevisionAction =
  | "estimate" | "reply" | "confirm"
  | "accept-selection" | "accept-as-estimated" | "enquiry";

interface Revision {
  _id: string;
  items: QuoteItem[];
  authorRole: "workshop" | "customer";
  action: RevisionAction;
  round: number;
  note: string;
  voiceUrl: string;
  createdAt: string;
}
interface Quote {
  _id: string;
  revisions: Revision[];
  status: "awaiting-customer" | "awaiting-workshop" | "accepted" | "cancelled";
  currentRound: number;
  agreedTotal: number;
  pendingAcceptance: { total: number | null; mode: "selection" | "as-estimated" | null } | null;
}

const rs = (paisa: number) => `Rs ${(paisa / 100).toFixed(2)}`;

const STATUS_TEXT: Record<Quote["status"], string> = {
  "awaiting-customer": "Waiting on the customer",
  "awaiting-workshop": "Your move",
  accepted: "Agreed",
  cancelled: "Cancelled",
};

const ACTION_TEXT: Record<RevisionAction, string> = {
  estimate: "sent an estimate",
  reply: "replied",
  confirm: "confirmed the price",
  "accept-selection": "accepted their selection",
  "accept-as-estimated": "accepted the full estimate",
  enquiry: "asked a question",
};

// Records a short voice note. Useful in a workshop where typing part names on
// a phone is awkward, and it sidesteps the written-Nepali/English barrier.
function useVoiceRecorder() {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = () => {
        setBlob(new Blob(chunksRef.current, { type: recorder.mimeType }));
        stream.getTracks().forEach((t) => t.stop());
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      toast.error("Couldn't access the microphone — check browser permissions");
    }
  };

  const stop = () => {
    recorderRef.current?.stop();
    setRecording(false);
  };

  return { recording, blob, start, stop, clear: () => setBlob(null) };
}

/**
 * The parts estimate for one booking, from whichever side is looking at it.
 *
 * `side` decides who can do what: the workshop builds and prices the lines,
 * the customer only ticks which of those lines they actually want. Prices are
 * never editable by the customer — their copy is rebuilt server-side from the
 * workshop's own revision.
 */
function PartsQuotePanel({ bookingId, side }: { bookingId: string; side: "workshop" | "customer" }) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [closedReason, setClosedReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState("");
  const voice = useVoiceRecorder();

  // Workshop's editable draft.
  const [draft, setDraft] = useState<{ part: string; price: string }[]>([{ part: "", price: "" }]);
  // Customer's tick state, keyed by part name.
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  // Workshop has settled a round and is starting another one.
  const [addingRound, setAddingRound] = useState(false);

  const latest = quote?.revisions[quote.revisions.length - 1] ?? null;
  const settled = quote?.status === "accepted";
  // Paid, refunded or cancelled: the price can no longer change, so no action
  // is offered on either side. The server enforces the same rule.
  const closed = Boolean(closedReason);

  const load = async () => {
    try {
      const res = await api.get(`/bookings/${bookingId}/quote`);
      setQuote(res.data.quote);
      setClosedReason(res.data.closedReason ?? null);
      const rev = res.data.quote?.revisions?.[res.data.quote.revisions.length - 1];
      if (rev) {
        setPicked(Object.fromEntries(rev.items.map((i: QuoteItem) => [i.part, i.selected])));
        // Seed the workshop's editor with the current lines so a revision is
        // an edit of what's there, not a blank slate.
        if (side === "workshop") {
          setDraft(rev.items.map((i: QuoteItem) => ({ part: i.part, price: String(i.price / 100) })));
        }
      }
    } catch {
      toast.error("Failed to load the parts estimate");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Fetching this booking's quote on mount / when the booking changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  const draftTotal = draft.reduce((sum, r) => sum + Math.round((Number(r.price) || 0) * 100), 0);
  // What the customer has ticked, versus everything the workshop listed. Shown
  // side by side so "accept what I chose" and "accept as quoted" are two
  // visible prices rather than one number that silently changes.
  const pickedTotal = (latest?.items ?? [])
    .filter((i) => picked[i.part])
    .reduce((sum, i) => sum + i.price, 0);
  const fullTotal = (latest?.items ?? []).reduce((sum, i) => sum + i.price, 0);
  const droppedAny = pickedTotal !== fullTotal;
  const awaitingConfirm = quote?.pendingAcceptance?.total != null;

  const attachVoice = (form: FormData) => {
    if (voice.blob) form.append("voice", voice.blob, "note.webm");
  };

  const sendWorkshop = async () => {
    const items = draft
      .filter((r) => r.part.trim())
      .map((r) => ({ part: r.part.trim(), price: Math.round((Number(r.price) || 0) * 100) }));
    if (items.length === 0) {
      toast.error("Add at least one part");
      return;
    }
    setSending(true);
    try {
      const form = new FormData();
      form.append("items", JSON.stringify(items));
      form.append("note", note);
      attachVoice(form);
      await api.post(`/bookings/${bookingId}/quote/workshop`, form);
      toast.success("Estimate sent to the customer");
      setNote("");
      voice.clear();
      setAddingRound(false);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to send the estimate"));
    } finally {
      setSending(false);
    }
  };

  // One endpoint, three meanings. Accepting commits to a figure; an enquiry
  // deliberately commits to nothing so a question can't be read as agreement.
  const sendCustomer = async (action: "accept-selection" | "accept-as-estimated" | "enquiry") => {
    if (action === "enquiry" && !note.trim() && !voice.blob) {
      toast.error("Add a note or a voice message with your question");
      return;
    }
    setSending(true);
    try {
      const form = new FormData();
      form.append("action", action);
      form.append("selectedParts", JSON.stringify(Object.keys(picked).filter((p) => picked[p])));
      form.append("note", note);
      attachVoice(form);
      await api.post(`/bookings/${bookingId}/quote/customer`, form);
      toast.success(
        action === "enquiry"
          ? "Question sent — the workshop will reply"
          : "Accepted — waiting for the workshop to confirm"
      );
      setNote("");
      voice.clear();
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to send your response"));
    } finally {
      setSending(false);
    }
  };

  // Workshop answering a question, list and price untouched.
  const sendReply = async () => {
    if (!note.trim() && !voice.blob) {
      toast.error("Add a note or a voice message");
      return;
    }
    setSending(true);
    try {
      const form = new FormData();
      form.append("note", note);
      attachVoice(form);
      await api.post(`/bookings/${bookingId}/quote/reply`, form);
      toast.success("Reply sent");
      setNote("");
      voice.clear();
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to reply"));
    } finally {
      setSending(false);
    }
  };

  // Only the workshop confirms — this is the step that fixes the price.
  const confirm = async () => {
    setSending(true);
    try {
      await api.post(`/bookings/${bookingId}/quote/confirm`, { note });
      toast.success("Price confirmed");
      setNote("");
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to confirm"));
    } finally {
      setSending(false);
    }
  };

  if (loading) return <p className="pq-muted">Loading estimate...</p>;

  return (
    <div className="pq-panel">
      <div className="pq-head">
        <h3>Parts &amp; Labour Estimate</h3>
        {quote && <span className={`pq-status pq-status-${quote.status}`}>{STATUS_TEXT[quote.status]}</span>}
      </div>

      {/* What the other side last sent. Read-only for the workshop (it's their
          own list echoed back); tickable for the customer. */}
      {latest && (
        <>
          <table className="pq-table">
            <thead>
              <tr>
                {side === "customer" && !settled && <th className="pq-tick">Keep</th>}
                <th>Part</th>
                <th className="pq-right">Price</th>
              </tr>
            </thead>
            <tbody>
              {latest.items.map((item) => {
                const on = side === "customer" && !settled ? picked[item.part] : item.selected;
                return (
                  <tr key={item.part} className={on ? "" : "pq-dropped"}>
                    {side === "customer" && !settled && (
                      <td className="pq-tick">
                        <input
                          type="checkbox"
                          checked={Boolean(picked[item.part])}
                          onChange={(e) => setPicked((p) => ({ ...p, [item.part]: e.target.checked }))}
                        />
                      </td>
                    )}
                    <td>{item.part}</td>
                    <td className="pq-right">{rs(item.price)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              {/* Both figures, always, when lines have been dropped — the
                  customer is choosing between two prices, not watching one
                  number change under them. */}
              {side === "customer" && !settled && droppedAny && (
                <tr className="pq-total-alt">
                  <td className="pq-tick" />
                  <td className="pq-total-label">Full estimate</td>
                  <td className="pq-right">{rs(fullTotal)}</td>
                </tr>
              )}
              <tr>
                {side === "customer" && !settled && <td className="pq-tick" />}
                <td className="pq-total-label">
                  {side === "customer" && !settled && droppedAny ? "Your selection" : "Total"}
                </td>
                <td className="pq-right pq-total-value">
                  {rs(side === "customer" && !settled ? pickedTotal : latest.items.filter((i) => i.selected).reduce((s, i) => s + i.price, 0))}
                </td>
              </tr>
            </tfoot>
          </table>

          {(latest.note || latest.voiceUrl) && (
            <div className="pq-message">
              <span className="pq-message-from">
                {latest.authorRole === "workshop" ? "Workshop" : "Customer"} said:
              </span>
              {latest.note && <p>{latest.note}</p>}
              {latest.voiceUrl && <audio controls src={latest.voiceUrl} className="pq-audio" />}
            </div>
          )}
        </>
      )}

      {/* The job's price is fixed — say so plainly instead of showing an
          editor that the server would reject anyway. */}
      {closed && <p className="pq-closed">{closedReason}</p>}

      {!latest && !closed && side === "customer" && (
        <p className="pq-muted">The workshop hasn't sent an estimate for this job yet.</p>
      )}
      {!latest && !closed && side === "workshop" && !addingRound && quote === null && (
        <p className="pq-muted">No estimate yet — build one below and send it to the customer.</p>
      )}

      {/* Workshop's editor: build or revise the line items. */}
      {side === "workshop" && !closed && (!settled || addingRound) && (
        <div className="pq-editor">
          <span className="pq-editor-head">{latest ? "Revise the estimate" : "Build the estimate"}</span>
          {draft.map((row, i) => (
            <div className="pq-editor-row" key={i}>
              <input
                placeholder="Part or labour"
                value={row.part}
                onChange={(e) =>
                  setDraft((d) => d.map((r, idx) => (idx === i ? { ...r, part: e.target.value } : r)))
                }
              />
              <input
                placeholder="Rs"
                inputMode="decimal"
                value={row.price}
                onChange={(e) =>
                  setDraft((d) => d.map((r, idx) => (idx === i ? { ...r, price: e.target.value } : r)))
                }
              />
              <button
                type="button"
                className="pq-row-remove"
                onClick={() => setDraft((d) => d.filter((_, idx) => idx !== i))}
                aria-label="Remove line"
              >
                ×
              </button>
            </div>
          ))}
          <div className="pq-editor-foot">
            <button type="button" className="pq-add-row" onClick={() => setDraft((d) => [...d, { part: "", price: "" }])}>
              + Add part
            </button>
            <span className="pq-draft-total">Total {rs(draftTotal)}</span>
          </div>
        </div>
      )}

      {!closed && (!settled || addingRound) && (latest || side === "workshop") && (
        <div className="pq-compose">
          <textarea
            rows={2}
            placeholder="Add a note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="pq-actions">
            <button
              type="button"
              className={`pq-voice ${voice.recording ? "recording" : ""}`}
              onClick={voice.recording ? voice.stop : voice.start}
            >
              {voice.recording ? "◼ Stop" : "🎤 Voice note"}
            </button>
            {voice.blob && !voice.recording && (
              <>
                <audio controls src={URL.createObjectURL(voice.blob)} className="pq-audio pq-audio-preview" />
                <button type="button" className="pq-voice-clear" onClick={voice.clear}>Discard</button>
              </>
            )}
            <span className="pq-spacer" />

            {side === "workshop" ? (
              <>
                <button className="uh-btn uh-btn-ghost" onClick={sendReply} disabled={sending || !latest}>
                  Reply
                </button>
                <button className="uh-btn uh-btn-primary" onClick={sendWorkshop} disabled={sending}>
                  {sending ? "Sending..." : latest ? "Send revision" : "Send estimate"}
                </button>
                {/* Only enabled once the customer has actually accepted — this
                    is the step that fixes the price. */}
                {awaitingConfirm && (
                  <button className="uh-btn uh-btn-orange" onClick={confirm} disabled={sending}>
                    Confirm {rs(quote!.pendingAcceptance!.total!)}
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  className="uh-btn uh-btn-ghost"
                  onClick={() => sendCustomer("enquiry")}
                  disabled={sending}
                  title="Ask a question without agreeing to anything"
                >
                  Send enquiry
                </button>
                {/* Two acceptances, two visible prices. Only shown separately
                    when they actually differ. */}
                {droppedAny && (
                  <button className="uh-btn uh-btn-primary" onClick={() => sendCustomer("accept-selection")} disabled={sending}>
                    Accept my selection {rs(pickedTotal)}
                  </button>
                )}
                <button className="uh-btn uh-btn-orange" onClick={() => sendCustomer("accept-as-estimated")} disabled={sending}>
                  Accept as estimated {rs(fullTotal)}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Waiting on the workshop: the customer has committed, so the panel
          says so instead of offering the buttons again. */}
      {!closed && !settled && side === "customer" && awaitingConfirm && (
        <p className="pq-settled pq-settled-wait">
          You accepted {rs(quote!.pendingAcceptance!.total!)} — waiting for the workshop to confirm.
          You can still send an enquiry, which withdraws the acceptance.
        </p>
      )}

      {settled && (
        <>
          <p className="pq-settled">
            Agreed — job total {rs(quote?.agreedTotal ?? 0)}
            {(quote?.currentRound ?? 1) > 1 && ` across ${quote?.currentRound} rounds`}.
          </p>
          {side === "workshop" && !addingRound && !closed && (
            <div className="pq-editor">
              <span className="pq-editor-head">Found more work?</span>
              <span className="pq-muted">
                Send another estimate and it stacks on top of the {rs(quote?.agreedTotal ?? 0)} already
                agreed — the customer accepts or queries it the same way.
              </span>
              <button
                className="uh-btn uh-btn-primary"
                style={{ alignSelf: "flex-start" }}
                onClick={() => { setDraft([{ part: "", price: "" }]); setAddingRound(true); }}
              >
                Add to the estimate
              </button>
            </div>
          )}
        </>
      )}

      {/* Every round, oldest first. The audit trail of what was agreed. */}
      {quote && quote.revisions.length > 1 && (
        <details className="pq-history">
          <summary>Estimate history ({quote.revisions.length} revisions)</summary>
          {quote.revisions.map((r) => (
            <div className="pq-history-row" key={r._id}>
              <span>
                <strong>{r.authorRole === "workshop" ? "Workshop" : "Customer"}</strong>{" "}
                {ACTION_TEXT[r.action] ?? r.action}
                {r.round > 1 && <em className="pq-round"> · round {r.round}</em>}
                <br />
                <em className="pq-round">{new Date(r.createdAt).toLocaleString()}</em>
              </span>
              <span>
                {r.items.filter((i) => i.selected).length}/{r.items.length} parts ·{" "}
                {rs(r.items.filter((i) => i.selected).reduce((s, i) => s + i.price, 0))}
              </span>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

export default PartsQuotePanel;
