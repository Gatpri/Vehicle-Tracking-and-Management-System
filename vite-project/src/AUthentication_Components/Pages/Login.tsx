import { useState, type FormEvent } from "react";
import "../styles/Login.css";
import { Link } from "react-router-dom";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { toast } from 'react-toastify';

function Login() {
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState(false);
  const navigate =useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    try {
      const result = await axios.post("http://localhost:3000/login", {
        email,
        password,
      });
      console.log(result.data);

if (result.data.success) {
  // ✅ SAVE TOKEN (MOST IMPORTANT FIX)
  localStorage.setItem("token", result.data.token);

  // keep this
  localStorage.setItem("user", JSON.stringify(result.data.user));

  const role = result.data.user.role;

  if (role === "admin" || role === "superadmin") {
    navigate("/dashboard");
  } else {
    navigate("/home");
  }
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

