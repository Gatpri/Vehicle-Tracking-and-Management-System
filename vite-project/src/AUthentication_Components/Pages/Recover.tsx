
import { useState, type FormEvent } from "react";
import "../styles/Recover.css";
import BrandLogo from "../../components/BrandLogo";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { toast } from 'react-toastify';

function Recover() {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Send OTP
  const handleSendOTP = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await axios.post("/api/send-otp", { email });
      if (result.data.success) {
        toast.success("OTP sent to your email!");
        setStep("otp"); // move to OTP input step
      } else {
        toast.error(result.data.message);
      }
    } catch (err) {
      toast.error("Something went wrong");
    }
    setLoading(false);
  };

  // Verify OTP
  const handleVerifyOTP = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await axios.post("/api/verify-otp", { email, otp });
      if (result.data.success) {
        toast.success("OTP verified!");
        // resetToken is the proof the OTP was actually verified — /reset-password
        // rejects the request without it.
        navigate("/reset-password", { state: { email, resetToken: result.data.resetToken } });
      } else {
        toast.error(result.data.message);
      }
    } catch (err) {
      toast.error("Something went wrong");
    }
    setLoading(false);
  };

  return (
    <div className="recover">
      <div className="container">

        {/* Left Side */}
        <div className="left">
          <BrandLogo tone="light" />
          <h1 className="auth-tagline">Every Vehicle
            <br />
            <span className="gradient">Verified</span>, Tracked
            <br />
            And Recovered
          </h1>
          <p className="auth-subtagline">
            Nationwide plate recognition for Nepal's roads.
          </p>
        </div>

        {/* Right Side */}
        <div className="right">
          <h2>Recover Your Password</h2>

          {/* STEP 1 - Email form */}
          {step === "email" && (
            <form onSubmit={handleSendOTP}>
              <div className="email">
                <label htmlFor="email">Enter Your Existing Email:</label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@gmail.com"
                  required
                />
              </div>
              <div className="OTP_button">
                <button type="submit" id="otp_button" disabled={loading}>
                  {loading ? "Sending..." : "Send OTP"}
                </button>
              </div>
            </form>
          )}

          {/* STEP 2 - OTP form */}
          {step === "otp" && (
            <form onSubmit={handleVerifyOTP}>
              <div className="email">
                <label htmlFor="otp">Enter OTP sent to {email}:</label>
                <input
                  type="text"
                  id="otp"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="Enter 6 digit OTP"
                  required
                />
              </div>
              <div className="OTP_button">
                <button type="submit" id="otp_button" disabled={loading}>
                  {loading ? "Verifying..." : "Verify OTP"}
                </button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}

export default Recover;
