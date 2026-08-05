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
import StaffLayout from './components/StaffLayout';

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
import ServiceHistoryPage from './app_pages/ServiceHistoryPage';

import AdminBookingsPage from './admin_pages/AdminBookingsPage';
import AdminWorkshopsPage from './admin_pages/AdminWorkshopsPage';
import AdminCctvPage from './admin_pages/AdminCctvPage';
import AdminSosPage from './admin_pages/AdminSosPage';
import AdminTheftPage from './admin_pages/AdminTheftPage';
import AdminChatPage from './admin_pages/AdminChatPage';
import AdminWithdrawalsPage from './admin_pages/AdminWithdrawalsPage';
import AdminWalletsPage from './admin_pages/AdminWalletsPage';
import AdminMyWalletPage from './admin_pages/AdminMyWalletPage';
import AdminDeliveriesPage from './admin_pages/AdminDeliveriesPage';
import DeliveryStaffTablePage from './admin_pages/DeliveryStaffTablePage';
import AdminStaffLocationsPage from './admin_pages/AdminStaffLocationsPage';
import DeliveryDashboardPage from './app_pages/staff/DeliveryDashboardPage';

// Each group guards the pages its roles can actually use. These must stay in
// step with AdminLayout's NAV_LINKS: a route stricter than its nav link means
// the link bounces, and a route stricter than landingPathFor sends a role into
// a redirect loop. See src/lib/roles.ts.
import {
  FULL_ADMIN_ROLES,
  TRACKING_ROLES,
  WORKSHOP_ROLES,
  CHAT_ROLES,
  ACCOUNTING_ROLES,
  ADMIN_AREA_ROLES,
  DELIVERY_STAFF_ROLE,
  DELIVERY_ADMIN_ROLE,
  DELIVERY_MANAGE_ROLES,
  STAFF_LOCATION_VIEWER_ROLES,
  landingPathFor,
} from './lib/roles';


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
            // Persist the session before navigating: without this the redirect
            // flow left localStorage empty, so ProtectedRoute saw no user and
            // bounced every admin page straight back to /login.
            localStorage.setItem("token", response.data.token);
            localStorage.setItem("user", JSON.stringify(response.data.user));
            toast.success("Sign in successful");
            navigate(landingPathFor(response.data.user.role));
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

{/* Platform administration — full admins only. */}
<Route path="/dashboard" element={<ProtectedRoute allowedRoles={FULL_ADMIN_ROLES}><AdminLayout><Dashboard/></AdminLayout></ProtectedRoute>}/>
<Route path="/admin/bookings" element={<ProtectedRoute allowedRoles={WORKSHOP_ROLES}><AdminLayout><AdminBookingsPage/></AdminLayout></ProtectedRoute>}/>
<Route path="/admin/workshops" element={<ProtectedRoute allowedRoles={WORKSHOP_ROLES}><AdminLayout><AdminWorkshopsPage/></AdminLayout></ProtectedRoute>}/>
{/* Assignment is admin/superadmin/delivery-admin — workshop-admin can view
    delivery status inline on their bookings, but doesn't get an assignment
    screen. delivery-admin's own reach is region-narrowed server-side. */}
<Route path="/admin/deliveries" element={<ProtectedRoute allowedRoles={DELIVERY_MANAGE_ROLES}><AdminLayout><AdminDeliveriesPage/></AdminLayout></ProtectedRoute>}/>
{/* delivery-admin's landing page (also reachable by full admins) — manage
    and, for admin/superadmin, hard-delete delivery-staff accounts. */}
<Route path="/admin/delivery-staff" element={<ProtectedRoute allowedRoles={[...FULL_ADMIN_ROLES, DELIVERY_ADMIN_ROLE]}><AdminLayout><DeliveryStaffTablePage/></AdminLayout></ProtectedRoute>}/>
{/* Always-on live location of any online delivery-staff member — not
    booking-scoped, unlike LiveDeliveryMap. */}
<Route path="/admin/staff-locations" element={<ProtectedRoute allowedRoles={STAFF_LOCATION_VIEWER_ROLES}><AdminLayout><AdminStaffLocationsPage/></AdminLayout></ProtectedRoute>}/>

{/* Vehicle recovery — also open to vehicle-tracking-admin. */}
<Route path="/admin/cctv" element={<ProtectedRoute allowedRoles={TRACKING_ROLES}><AdminLayout><AdminCctvPage/></AdminLayout></ProtectedRoute>}/>
<Route path="/admin/sos" element={<ProtectedRoute allowedRoles={TRACKING_ROLES}><AdminLayout><AdminSosPage/></AdminLayout></ProtectedRoute>}/>
<Route path="/admin/theft-reports" element={<ProtectedRoute allowedRoles={TRACKING_ROLES}><AdminLayout><AdminTheftPage/></AdminLayout></ProtectedRoute>}/>
<Route path="/admin/chat" element={<ProtectedRoute allowedRoles={CHAT_ROLES}><AdminLayout><AdminChatPage/></AdminLayout></ProtectedRoute>}/>
<Route path="/admin/withdrawals" element={<ProtectedRoute allowedRoles={ACCOUNTING_ROLES}><AdminLayout><AdminWithdrawalsPage/></AdminLayout></ProtectedRoute>}/>
<Route path="/admin/wallets" element={<ProtectedRoute allowedRoles={ACCOUNTING_ROLES}><AdminLayout><AdminWalletsPage/></AdminLayout></ProtectedRoute>}/>
{/* Own wallet, in the dashboard. Open to every admin-area role — it only ever
    shows the signed-in user's own balance. */}
<Route path="/admin/my-wallet" element={<ProtectedRoute allowedRoles={ADMIN_AREA_ROLES}><AdminLayout><AdminMyWalletPage/></AdminLayout></ProtectedRoute>}/>

<Route path="/vehicles" element={<ProtectedRoute><AppLayout><VehiclesPage/></AppLayout></ProtectedRoute>}/>
<Route path="/vehicles/:id" element={<ProtectedRoute><AppLayout><VehicleDetailPage/></AppLayout></ProtectedRoute>}/>
<Route path="/vehicles/:vehicleId/history" element={<ProtectedRoute><AppLayout><ServiceHistoryPage/></AppLayout></ProtectedRoute>}/>
<Route path="/workshops" element={<ProtectedRoute><AppLayout><WorkshopsPage/></AppLayout></ProtectedRoute>}/>
<Route path="/workshops/:id" element={<ProtectedRoute><AppLayout><WorkshopDetailPage/></AppLayout></ProtectedRoute>}/>
<Route path="/bookings" element={<ProtectedRoute><AppLayout><BookingsPage/></AppLayout></ProtectedRoute>}/>
<Route path="/tracking/:vehicleId" element={<ProtectedRoute><AppLayout><TrackingPage/></AppLayout></ProtectedRoute>}/>
<Route path="/wallet" element={<ProtectedRoute><AppLayout><WalletPage/></AppLayout></ProtectedRoute>}/>
<Route path="/chat" element={<ProtectedRoute><AppLayout><ChatPage/></AppLayout></ProtectedRoute>}/>
<Route path="/sos" element={<ProtectedRoute><AppLayout><SosPage/></AppLayout></ProtectedRoute>}/>
<Route path="/safety" element={<ProtectedRoute><AppLayout><SafetyPage/></AppLayout></ProtectedRoute>}/>

{/* Delivery-staff: a field-worker role with its own minimal layout. */}
<Route path="/staff/deliveries" element={<ProtectedRoute allowedRoles={[DELIVERY_STAFF_ROLE]}><StaffLayout><DeliveryDashboardPage/></StaffLayout></ProtectedRoute>}/>
</Routes>
</>
  );
}
export default App;


