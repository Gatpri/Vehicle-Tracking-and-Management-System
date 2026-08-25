import { useState, type FormEvent } from "react";
import "../styles/Login.css";
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { toast } from 'react-toastify';
import { auth, googleProvider } from "../../firebase";
import { signInWithPopup } from "firebase/auth";
import { landingPathFor } from "../../lib/roles";
import api from "../../lib/api";
import { useAuth } from "../../lib/AuthContext";

function Login() {
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const navigate =useNavigate();
  const { refresh } = useAuth();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    try {
      const result = await api.post("/login", {
        email,
        password,
      });

if (result.data.success) {
  // Nothing to store: the server set an httpOnly session cookie. Pull the
  // authoritative user record through /api/me so the whole app shares one
  // source of truth for who is signed in and what role they hold.
  const user = await refresh();

  // Each role has its own landing page — a vehicle-tracking-admin has no
  // access to /dashboard, so sending them there would just bounce.
  if (user) navigate(landingPathFor(user.role));
}

    } catch (err) {
      // Surface backend error body for easier debugging
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      const backend = err?.response?.data;
      console.error(backend || err);
      if (backend?.message) toast.error(backend.message);
    }
  };

  // Popup, deliberately — not signInWithRedirect. Firebase's popup flow polls
  // `popup.closed`, which Google's COOP policy on accounts.google.com blocks,
  // so Chrome logs a "Cross-Origin-Opener-Policy policy would block the
  // window.closed call" warning on every poll. That warning is cosmetic: the
  // sign-in completes regardless.
  //
  // Redirect silences it but is far more fragile — the return trip has to land
  // back on an origin Firebase lists under Authorized Domains, and browsers
  // blocking third-party storage can drop the pending sign-in state entirely.
  // A noisy console beats a login that fails, so this stays on popup.
  //
  // /google-auth creates the account on first sign-in and returns the existing
  // one afterwards, so this one handler covers both signup and login.
  const handleGoogleSignIn = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (isSigning) return;
    setIsSigning(true);
    try {
      googleProvider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(auth, googleProvider);
      const idToken = await result.user.getIdToken();
      const response = await api.post("/google-auth", { idToken });
      if (response.data.success) {
        // The server set an httpOnly session cookie; /api/me is how the app
        // learns who that session belongs to.
        const user = await refresh();
        toast.success("Login Successful!");
        if (user) navigate(landingPathFor(user.role));
      } else {
        toast.error(response.data.message || "Google login failed");
      }
    } catch (error) {
      console.error("Google Sign-In error:", error);
      toast.error(error instanceof Error ? error.message : "Google Sign-In failed");
    } finally {
      setIsSigning(false);
    }
  };

  return (
    <div className="login">
      <div className="container">
        {/*LeftSide*/}
        <div className="left">
          <h3 className="logo">
            Practice<span>Project</span>
          </h3>

          <h1>
            Launch Product With
            <br />
            <span className="gradient">ACME IT</span>
            <br />
            Build Career
          </h1>
        </div>

        {/*RightSide*/}
        <div className="right">
          <h2>Login Page</h2>
          <form onSubmit={handleSubmit}>
            <div className="email">
              <label htmlFor="email">Email:</label>
              <input
                type="email"
                id="email"
                name="myEmail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@gmail.com"
              />
            </div>

            <div className="password">
              <label htmlFor="passwprd">Password:</label>
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                name="myPassword"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <span
                className="toogle"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? "🙈" : "👁️"}
              </span>
            </div>
            <div className="login_button">
              <button type="submit" id="button">
                Login
              </button>
            </div>

            <div className="google_button">
              <button type="button" id="google_button" onClick={handleGoogleSignIn} disabled={isSigning}>
                {isSigning ? "Signing in..." : "Sign in with Google"}
              </button>
            </div>

            <Link to="/recover" className="forget_password">
              Forget Password
            </Link>
            <p className="go_to_signin">
              Don't have an account? <Link to="/signin">Create account</Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Login;



// import { useState, type FormEvent } from "react"; 
// import "../styles/Login.css";
// import { Link } from "react-router-dom";
// import axios from "axios";
// import { useNavigate } from "react-router-dom";
// import { toast } from 'react-toastify';
// import { auth, googleProvider } from "../../firebase";  // ✅ add
// import { signInWithRedirect} from "firebase/auth";  // ✅ add

// function Login() {
//   const [email, setEmail] = useState<string>("");
//   const [password, setPassword] = useState<string>("");
//   const [showPassword, setShowPassword] = useState(false);
//   const [isSigning, setIsSigning] = useState(false);  // ✅ add
//   const navigate = useNavigate();


//   const handleSubmit = async (e: FormEvent) => {
//     e.preventDefault();
//     try {
//       const result = await axios.post("http://localhost:3000/login", {
//         email,
//         password,
//       });

//       if (result.data.success) {
//         localStorage.setItem("user", JSON.stringify(result.data.user));
//         navigate("/dashboard");
//       }

//     } catch (err) {
//       // @ts-ignore
//       const backend = err?.response?.data;
//       console.error(backend || err);
//       if (backend?.message) toast.error(backend.message);
//     }
//   };

//   // ✅ NEW — Google Sign-In with redirect
//   const handleGoogleSignIn = async (e: React.MouseEvent<HTMLButtonElement>) => {
//     e.preventDefault();
//     if (isSigning) return;
//     setIsSigning(true);
//     try {
//       googleProvider.setCustomParameters({ prompt: 'select_account' });
//       await signInWithRedirect(auth, googleProvider);
//     } catch (error: any) {
//       toast.error(error.message || 'Google Sign-In failed');
//       setIsSigning(false);
//     }
//   };

//   return (
//     <div className="login">
//       <div className="container">
//         <div className="left">
//           <h3 className="logo">
//             Practice<span>Project</span>
//           </h3>
//           <h1>
//             Launch Product With
//             <br />
//             <span className="gradient">ACME IT</span>
//             <br />
//             Build Career
//           </h1>
//         </div>

//         <div className="right">
//           <h2>Login Page</h2>
//           <form onSubmit={handleSubmit}>
//             <div className="email">
//               <label htmlFor="email">Email:</label>
//               <input
//                 type="email"
//                 id="email"
//                 name="myEmail"
//                 value={email}
//                 onChange={(e) => setEmail(e.target.value)}
//                 placeholder="example@gmail.com"
//               />
//             </div>

//             <div className="password">
//               <label htmlFor="password">Password:</label>
//               <input
//                 type={showPassword ? "text" : "password"}
//                 id="password"
//                 name="myPassword"
//                 value={password}
//                 onChange={(e) => setPassword(e.target.value)}
//               />
//               <span className="toogle" onClick={() => setShowPassword(!showPassword)}>
//                 {showPassword ? "🙈" : "👁️"}
//               </span>
//             </div>

//             <div className="login_button">
//               <button type="submit" id="button">Login</button>
//             </div>

//             {/* ✅ NEW — Google Sign-In button */}
//             <div className="google_button">
//               <button type="button" id="google_button" onClick={handleGoogleSignIn} disabled={isSigning}>
//                 {isSigning ? 'Signing in...' : 'Sign in with Google'}
//               </button>
//             </div>

//             <Link to="/recover" className="forget_password">Forget Password</Link>

//             <p className="go_to_signin">
//               Don't have an account? <Link to="/signin">Create account</Link>
//             </p>
//           </form>
//         </div>
//       </div>
//     </div>
//   );
// }

// export default Login;

