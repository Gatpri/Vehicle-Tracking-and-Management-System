import { useEffect, useState } from "react";
import "../styles/Signin.css";
import { Link, useNavigate } from "react-router-dom";
import axios from 'axios';
import { toast } from 'react-toastify';
import { auth, googleProvider } from "../../firebase";
import { signInWithPopup } from "firebase/auth";  // popup, no useEffect needed
import { landingPathFor } from "../../lib/roles";

const VERIFY_POLL_MS = 3000;

function Signin(){

  const [firstname, setFirstName] = useState<string>("");
  const [lastname, setLastName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [isSigning, setIsSigning] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  const navigate = useNavigate();

  // While showing "check your email", poll for verification so this same
  // tab moves itself to /login once the link is clicked (in whatever tab
  // the email client opened it in) — no manual tab switching needed.
  useEffect(() => {
    if (!pendingEmail) return;

    const interval = setInterval(async () => {
      try {
        const res = await axios.get("/api/registration-status", {
          params: { email: pendingEmail },
        });
        if (res.data.verified) {
          clearInterval(interval);
          toast.success("Account created successfully!");
          navigate("/");
        }
      } catch (err) {
        console.error("registration-status poll failed:", err);
      }
    }, VERIFY_POLL_MS);

    return () => clearInterval(interval);
  }, [pendingEmail, navigate]);

  const clearForm = () => {
    setFirstName("");
    setLastName("");
    setEmail("");
    setPassword("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await axios.post("/api/register", {
        firstname,
        lastname,
        email,
        password,
      });
      if (result.data.success) {
        setPendingEmail(email);
        clearForm();
        toast.success(result.data.message);
      } else {
        toast.error(result.data.message || "Registration failed");
      }
    } catch (err: any) {
      const backend = err?.response?.data;
      console.error(backend || err);
      const firstValidationError = backend?.errors?.[0]?.msg;
      toast.error(firstValidationError || backend?.message || "Registration failed");
    }
  };

  // popup works perfectly on localhost, no Chrome state issues
  const handleGoogleSignIn = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (isSigning) return;
    setIsSigning(true);
    try {
      googleProvider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, googleProvider);  // result comes back directly
      const idToken = await result.user.getIdToken();
      const response = await axios.post("/api/google-auth", { idToken });
      if (response.data.success) {
        localStorage.setItem("user", JSON.stringify(response.data.user));
        localStorage.setItem("token", response.data.token);
        toast.success("Login Successful!");
        // Same role-aware landing as the password login — a
        // vehicle-tracking-admin has no dashboard to land on.
        navigate(landingPathFor(response.data.user.role));
      } else {
        toast.error("Google login failed");
      }
    } catch (error: any) {
      console.error("Google Sign-In error:", error);
      toast.error(error.message || 'Google Sign-In failed');
    } finally {
      setIsSigning(false);  // always resets button whether success or fail
    }
  };

  return (
    <div className="main">
      <div className="container">

        {/*LeftSide*/}
        <div className="left">
          <h3 className="logo">Practice<span>Project</span></h3>
          <h1>Launch Product With
            <br/>
            <span className="gradient">ACME IT</span>
            <br/>
            Build Career
          </h1>
        </div>

        {/*RightSide*/}
        <div className="right">
          {pendingEmail ? (
            <div className="pending-verify">
              <span className="pending-verify-icon">✉️</span>
              <h2>Check your email</h2>
              <p>
                We sent a confirmation link to <strong>{pendingEmail}</strong>.
                Click the link to verify your account — it expires in 5 minutes.
              </p>
              <button
                type="button"
                className="pending-verify-retry"
                onClick={() => setPendingEmail(null)}
              >
                Use a different email
              </button>
              <p className="account_already">
                Already verified?
                <Link to="/login">Login</Link>
              </p>
            </div>
          ) : (
          <>
          <h2>Create Account</h2>
          <form onSubmit={handleSubmit}>

            <div className="name">
              <div className="firstName">
                <label htmlFor="firstname">First Name*
                  <input type="text" id="firstname" name="myFirstName" value={firstname} onChange={(e) => setFirstName(e.target.value)} required maxLength={50}/>
                </label>
              </div>
              <div className="lastName">
                <label htmlFor="lastname">Last Name*
                  <input type="text" id="lastname" name="myLastName" value={lastname} onChange={(e) => setLastName(e.target.value)} required maxLength={50}/>
                </label>
              </div>
            </div>

            <div className="email">
              <label htmlFor="email">Email*
                <input type="email" id="email" name="myEmail" placeholder="example@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} required/>
              </label>
            </div>

            <div className="password">
              <label htmlFor="password">Password*
                <input type={showPassword ? "text" : "password"} id="password" name="mypassword" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8}/>
              </label>
              <span className="toogle" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? "🙈" : "👁️"}
              </span>
            </div>

            <p className="below_password">Must be at least 8 characters</p>

            <div className="create_acc_button">
              <button type="submit" id="button">Create Account</button>
            </div>

            <div className="google_button">
              <button type="button" id="google_button" onClick={handleGoogleSignIn} disabled={isSigning}>
                {isSigning ? 'Signing in...' : 'Sign up with Google'}
              </button>
            </div>

            <p className="account_already">
              Already have an account?
              <Link to="/login">Login</Link>
            </p>

          </form>
          </>
          )}
        </div>

      </div>
    </div>
  );
}

export default Signin;



// import { useState} from "react";
// import "../styles/Signin.css";
// import { Link, useNavigate } from "react-router-dom";
// import axios from 'axios';
// import { toast } from 'react-toastify';
// import { auth, googleProvider } from "../../firebase";
// import { signInWithRedirect} from "firebase/auth";

// function Signin(){

//   const [firstname, setFirstName] = useState<string>("");
//   const [lastname, setLastName] = useState<string>("");
//   const [email, setEmail] = useState<string>("");
//   const [password, setPassword] = useState<string>("");
//   const [isSigning, setIsSigning] = useState(false);
//   const [showPassword, setShowPassword] = useState(false);

//   const navigate = useNavigate();

//   const clearForm = () => {
//     setFirstName("");
//     setLastName("");
//     setEmail("");
//     setPassword("");
//   };


//   const handleSubmit = async (e: React.FormEvent) => {
//     e.preventDefault();
//     try {
//       const result = await axios.post("http://localhost:3000/register", {
//         firstname,
//         lastname,
//         email,
//         password,
//       });
//       if (result.data.success) {
//         clearForm();
//         toast.success(result.data.message);
//         navigate("/dashboard");
//       } else {
//         toast.error("Registration failed: " + result.data.message);
//       }
//     } catch (err) {
//       console.log(err);
//     }
//   };

//   // ✅ CHANGED — signInWithPopup → signInWithRedirect (no popup, no COOP warning)
//   const handleGoogleSignIn = async (e: React.MouseEvent<HTMLButtonElement>) => {
//     e.preventDefault();
//     if (isSigning) return;
//     setIsSigning(true);
//     try {
//       googleProvider.setCustomParameters({ prompt: 'select_account' });
//       await signInWithRedirect(auth, googleProvider);
//       // ← page redirects to Google, result is handled in useEffect above
//     } catch (error: any) {
//       console.error("Google Sign-In error:", error);
//       toast.error(error.message || 'Google Sign-In failed');
//       setIsSigning(false);  // ✅ only reset on error, redirect resets page anyway
//     }
//   };

//   return (
//     <div className="main">
//       <div className="container">
//         <div className="left">
//           <h3 className="logo">Practice<span>Project</span></h3>
//           <h1>Launch Product With
//             <br/>
//             <span className="gradient">ACME IT</span>
//             <br/>
//             Build Career
//           </h1>
//         </div>

//         <div className="right">
//           <h2>Create Account</h2>
//           <form onSubmit={handleSubmit}>
//             <div className="name">
//               <div className="firstName">
//                 <label htmlFor="firstname">First Name*
//                   <input type="text" id="firstname" name="myFirstName" value={firstname} onChange={(e) => setFirstName(e.target.value)}/>
//                 </label>
//               </div>
//               <div className="lastName">
//                 <label htmlFor="lastname">Last Name*
//                   <input type="text" id="lastname" name="myLastName" value={lastname} onChange={(e) => setLastName(e.target.value)}/>
//                 </label>
//               </div>
//             </div>

//             <div className="email">
//               <label htmlFor="email">Email*
//                 <input type="email" id="email" name="myEmail" placeholder="example@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)}/>
//               </label>
//             </div>

//             <div className="password">
//               <label htmlFor="password">Password*
//                 <input type={showPassword ? "text" : "password"} id="password" name="mypassword" value={password} onChange={(e) => setPassword(e.target.value)}/>
//               </label>
//               <span className="toogle" onClick={() => setShowPassword(!showPassword)}>
//                 {showPassword ? "🙈" : "👁️"}
//               </span>
//             </div>

//             <p className="below_password">Must be at least 8 characters</p>

//             <div className="create_acc_button">
//               <button type="submit" id="button">Create Account</button>
//             </div>

//             <div className="google_button">
//               <button type="button" id="google_button" onClick={handleGoogleSignIn} disabled={isSigning}>
//                 {isSigning ? 'Signing in...' : 'Sign up with Google'}
//               </button>
//             </div>

//             <p className="account_already">
//               Already have an account?
//               <Link to="/login">Login</Link>
//             </p>
//           </form>
//         </div>
//       </div>
//     </div>
//   );
// }

// export default Signin;