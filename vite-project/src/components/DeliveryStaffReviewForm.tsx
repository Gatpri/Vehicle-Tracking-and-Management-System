import { useState, type FormEvent } from "react";
import { toast } from "react-toastify";
import api, { getErrorMessage } from "../lib/api";

interface Props {
  deliveryId: string;
  staffName: string;
  onSubmitted: () => void;
}

function DeliveryStaffReviewForm({ deliveryId, staffName, onSubmitted }: Props) {
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setPosting(true);
    try {
      await api.post("/deliveries/reviews", { deliveryId, rating, text });
      toast.success("Thanks — your review is posted");
      onSubmitted();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to post review"));
    } finally {
      setPosting(false);
    }
  };

  return (
    <form className="uh-card ap-review-form" onSubmit={submit}>
      <p style={{ fontSize: 13, marginBottom: 8 }}>Rate {staffName}'s delivery service</p>
      <div className="uh-form-row">
        <select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>{"★".repeat(n)}</option>
          ))}
        </select>
      </div>
      <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Optional feedback" />
      <button className="uh-btn uh-btn-primary uh-btn-sm" type="submit" disabled={posting}>
        {posting ? "Posting..." : "Post Review"}
      </button>
    </form>
  );
}

export default DeliveryStaffReviewForm;
