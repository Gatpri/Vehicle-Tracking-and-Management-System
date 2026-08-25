import './App.css'
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { useEffect } from 'react';
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
import api from './lib/api';
import { useAuth } from './lib/AuthContext';
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
import HelpPage from './app_pages/HelpPage';
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
  CUSTOMER_ROLES,
  landingPathFor,
} from './lib/roles';


/**
 * Terminal destination for unmatched URLs. Reads the session from context
 * rather than going through ProtectedRoute: there is no page to protect here,
 * only a decision about where an unknown path should send someone.
 */
function CatchAllRedirect() {
  const { user, status } = useAuth();
  // Identity isn't known until /api/me answers — redirecting during that
  // window would send signed-in users to /signin on every refresh.
  if (status === "loading") return null;
  if (!user) return <Navigate to="/signin" replace />;
  return <Navigate to={landingPathFor(user.role)} replace />;
}

function App(){
  const navigate = useNavigate();
  const { refresh } = useAuth();

  useEffect(() => {
    const handleRedirect = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result && result.user) {
          const idToken = await result.user.getIdToken();
          const response = await api.post("/google-auth", { idToken, email: result.user.email, displayName: result.user.displayName });
          if (response.data.success) {
            // The server set the httpOnly session cookie; pull the user record
            // through /api/me so context is populated before we navigate —
            // otherwise ProtectedRoute would still read "anonymous" and bounce
            // every admin page straight back to /signin.
            const user = await refresh();
            toast.success("Sign in successful");
            if (user) navigate(landingPathFor(user.role));
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
  }, [navigate, refresh]);

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

{/* The customer home page. Guarded like every other page rather than left
    open: without ProtectedRoute, typing /home or / reached the customer shell
    directly — no session needed, and any staff role landed in an app shell
    whose every link would bounce them. CUSTOMER_ROLES keeps it to customers,
    and staff are redirected to their own landing page by landingPathFor. */}
<Route path="/" element={<ProtectedRoute allowedRoles={CUSTOMER_ROLES}><Home /></ProtectedRoute>}/>
  <Route path = "/signin" element={<Signin />}/>
<Route path = "/login" element={<Login />}/>
<Route path = "/recover" element={<Recover />}/>
<Route path = "/reset-password" element={<ResetPassword/>}/>
<Route path = "/email-verified" element={<EmailVerified/>}/>
<Route path="/home" element={<ProtectedRoute allowedRoles={CUSTOMER_ROLES}><Home /></ProtectedRoute>}/>

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

{/* The customer app. Every page here is CUSTOMER_ROLES-only for the same
    reason as /home above — these are the pages the home page links to, so
    leaving them open to any signed-in role would just move the hole one URL
    along. Staff who land here are redirected to their own area. */}
<Route path="/vehicles" element={<ProtectedRoute allowedRoles={CUSTOMER_ROLES}><AppLayout><VehiclesPage/></AppLayout></ProtectedRoute>}/>
<Route path="/vehicles/:id" element={<ProtectedRoute allowedRoles={CUSTOMER_ROLES}><AppLayout><VehicleDetailPage/></AppLayout></ProtectedRoute>}/>
<Route path="/vehicles/:vehicleId/history" element={<ProtectedRoute allowedRoles={CUSTOMER_ROLES}><AppLayout><ServiceHistoryPage/></AppLayout></ProtectedRoute>}/>
<Route path="/workshops" element={<ProtectedRoute allowedRoles={CUSTOMER_ROLES}><AppLayout><WorkshopsPage/></AppLayout></ProtectedRoute>}/>
<Route path="/workshops/:id" element={<ProtectedRoute allowedRoles={CUSTOMER_ROLES}><AppLayout><WorkshopDetailPage/></AppLayout></ProtectedRoute>}/>
<Route path="/bookings" element={<ProtectedRoute allowedRoles={CUSTOMER_ROLES}><AppLayout><BookingsPage/></AppLayout></ProtectedRoute>}/>
<Route path="/tracking/:vehicleId" element={<ProtectedRoute allowedRoles={CUSTOMER_ROLES}><AppLayout><TrackingPage/></AppLayout></ProtectedRoute>}/>
<Route path="/wallet" element={<ProtectedRoute allowedRoles={CUSTOMER_ROLES}><AppLayout><WalletPage/></AppLayout></ProtectedRoute>}/>
<Route path="/chat" element={<ProtectedRoute allowedRoles={CUSTOMER_ROLES}><AppLayout><ChatPage/></AppLayout></ProtectedRoute>}/>
<Route path="/sos" element={<ProtectedRoute allowedRoles={CUSTOMER_ROLES}><AppLayout><SosPage/></AppLayout></ProtectedRoute>}/>
<Route path="/safety" element={<ProtectedRoute allowedRoles={CUSTOMER_ROLES}><AppLayout><SafetyPage/></AppLayout></ProtectedRoute>}/>
<Route path="/help" element={<ProtectedRoute allowedRoles={CUSTOMER_ROLES}><AppLayout><HelpPage/></AppLayout></ProtectedRoute>}/>

{/* Delivery-staff: a field-worker role with its own minimal layout. */}
<Route path="/staff/deliveries" element={<ProtectedRoute allowedRoles={[DELIVERY_STAFF_ROLE]}><StaffLayout><DeliveryDashboardPage/></StaffLayout></ProtectedRoute>}/>
{/* Delivery-staff earnings. Reuses AdminMyWalletPage — same endpoints, same
    feature as the customer /wallet page — so a courier checking their takings
    stays inside StaffLayout instead of being sent out to the customer site. */}
<Route path="/staff/earnings" element={<ProtectedRoute allowedRoles={[DELIVERY_STAFF_ROLE]}><StaffLayout><AdminMyWalletPage/></StaffLayout></ProtectedRoute>}/>

{/* Anything unmatched. Without this, a typo'd URL matched no route and React
    Router rendered an empty page, which reads as a broken app. Route it
    through the same guard as everything else: signed-in users go to their own
    landing page, everyone else to /login. */}
<Route path="*" element={<CatchAllRedirect/>}/>
</Routes>
</>
  );
}
export default App;


