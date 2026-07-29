import './App.css'
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { useEffect } from 'react';
import axios from 'axios';
import { getRedirectResult } from 'firebase/auth';
import { auth } from './firebase';
import { toast } from 'react-toastify';
import Login from "./AUthentication_Components/Pages/Login";
import Signin from "./AUthentication_Components/Pages/Signin";
import Recover from './AUthentication_Components/Pages/Recover';
import ResetPassword from './AUthentication_Components/Pages/reset_password';
import EmailVerified from './AUthentication_Components/Pages/EmailVerified';
import Dashboard from './Admin_Authorization/Pages/dashboard';
import Home from './home_components/Pages/home'
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './components/AppLayout';
import AdminLayout from './components/AdminLayout';

import VehiclesPage from './app_pages/VehiclesPage';
import VehicleDetailPage from './app_pages/VehicleDetailPage';
import WorkshopsPage from './app_pages/WorkshopsPage';
import WorkshopDetailPage from './app_pages/WorkshopDetailPage';
import BookingsPage from './app_pages/BookingsPage';
import TrackingPage from './app_pages/TrackingPage';
import WalletPage from './app_pages/WalletPage';
import ChatPage from './app_pages/ChatPage';
import SosPage from './app_pages/SosPage';
import SafetyPage from './app_pages/SafetyPage';

import AdminBookingsPage from './admin_pages/AdminBookingsPage';
import AdminWorkshopsPage from './admin_pages/AdminWorkshopsPage';
import AdminCctvPage from './admin_pages/AdminCctvPage';
import AdminSosPage from './admin_pages/AdminSosPage';
import AdminTheftPage from './admin_pages/AdminTheftPage';
import AdminChatPage from './admin_pages/AdminChatPage';

const ADMIN_ROLES = ["admin", "superadmin"];

function App(){
  const navigate = useNavigate();

  useEffect(() => {
    const handleRedirect = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result && result.user) {
          const idToken = await result.user.getIdToken();
          const response = await axios.post("http://localhost:3000/google-auth", { idToken, email: result.user.email, displayName: result.user.displayName });
          if (response.data.success) {
            toast.success("Sign in successful");
            navigate('/home');
          } else {
            toast.error(response.data.message || "Authentication failed");
          }
        }
      } catch (err: any) {
        // Redirect flow errors are often benign; log for debugging
        console.error('getRedirectResult error:', err);
      }
    };
    handleRedirect();
  }, [navigate]);

  return(
<>
    <ToastContainer
     position="top-right"
  autoClose={5000}
  closeOnClick
  pauseOnFocusLoss
  draggable
  pauseOnHover
  theme='colored'
    aria-label="notifications" />
<Routes>

   <Route path="/" element={<Navigate to="/signin" />} />
  <Route path = "/signin" element={<Signin />}/>
<Route path = "/login" element={<Login />}/>
<Route path = "/recover" element={<Recover />}/>
<Route path = "/reset-password" element={<ResetPassword/>}/>
<Route path = "/email-verified" element={<EmailVerified/>}/>
<Route path = "/home" element={<Home />}/>

<Route path="/dashboard" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><AdminLayout><Dashboard/></AdminLayout></ProtectedRoute>}/>
<Route path="/admin/bookings" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><AdminLayout><AdminBookingsPage/></AdminLayout></ProtectedRoute>}/>
<Route path="/admin/workshops" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><AdminLayout><AdminWorkshopsPage/></AdminLayout></ProtectedRoute>}/>
<Route path="/admin/cctv" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><AdminLayout><AdminCctvPage/></AdminLayout></ProtectedRoute>}/>
<Route path="/admin/sos" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><AdminLayout><AdminSosPage/></AdminLayout></ProtectedRoute>}/>
<Route path="/admin/theft-reports" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><AdminLayout><AdminTheftPage/></AdminLayout></ProtectedRoute>}/>
<Route path="/admin/chat" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><AdminLayout><AdminChatPage/></AdminLayout></ProtectedRoute>}/>

<Route path="/vehicles" element={<ProtectedRoute><AppLayout><VehiclesPage/></AppLayout></ProtectedRoute>}/>
<Route path="/vehicles/:id" element={<ProtectedRoute><AppLayout><VehicleDetailPage/></AppLayout></ProtectedRoute>}/>
<Route path="/workshops" element={<ProtectedRoute><AppLayout><WorkshopsPage/></AppLayout></ProtectedRoute>}/>
<Route path="/workshops/:id" element={<ProtectedRoute><AppLayout><WorkshopDetailPage/></AppLayout></ProtectedRoute>}/>
<Route path="/bookings" element={<ProtectedRoute><AppLayout><BookingsPage/></AppLayout></ProtectedRoute>}/>
<Route path="/tracking/:vehicleId" element={<ProtectedRoute><AppLayout><TrackingPage/></AppLayout></ProtectedRoute>}/>
<Route path="/wallet" element={<ProtectedRoute><AppLayout><WalletPage/></AppLayout></ProtectedRoute>}/>
<Route path="/chat" element={<ProtectedRoute><AppLayout><ChatPage/></AppLayout></ProtectedRoute>}/>
<Route path="/sos" element={<ProtectedRoute><AppLayout><SosPage/></AppLayout></ProtectedRoute>}/>
<Route path="/safety" element={<ProtectedRoute><AppLayout><SafetyPage/></AppLayout></ProtectedRoute>}/>
</Routes>
</>
  );
}
export default App;


