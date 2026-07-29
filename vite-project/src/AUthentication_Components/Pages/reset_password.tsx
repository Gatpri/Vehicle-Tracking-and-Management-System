import { useState, type FormEvent } from "react";
import axios from "axios";
import { useLocation, useNavigate } from "react-router-dom";
import "../styles/reset_password.css";
import { toast } from 'react-toastify';

function ResetPassword() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const location = useLocation();
  const navigate = useNavigate();
  const email = location.state?.email; // ← received from Recover page

  const handleReset = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) return toast.error("Passwords do not match");

    try {
      const result = await axios.post("http://localhost:3000/reset-password", { email, newPassword });
      if (result.data.success) {
        toast.success("Password reset successful!");
        navigate("/");
      } else {
        toast.error(result.data.message);
      }
    } catch (err) {
      toast.error("Something went wrong");
    }
  };

  return (

<div className="reset_password">
      <div className="container">
          {/* Left Side */}
        <div className="left">
          <h3 className="logo">Practice<span>Project</span></h3>
          <h1>Launch Product With
            <br />
            <span className="gradient">ACME IT</span>
            <br />
            Build Career
          </h1>
        </div>


{/* Right Side */}
    <div className="right">
      <h2>Reset Password</h2>
      <form onSubmit={handleReset}>
        <input
          type="password"
          placeholder="New Password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Confirm Password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />
        <div className="reset_password_btn">
        <button type="submit" id="id_reset_password_button">Reset Password</button>
        </div>
      </form>
    </div>
  </div>
</div>
);
}

export default ResetPassword;
