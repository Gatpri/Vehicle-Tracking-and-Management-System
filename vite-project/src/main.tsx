import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from './lib/AuthContext';

// AuthProvider sits inside the router because App and its guards call
// useAuth(), and outside App so the /api/me lookup happens once per page
// load rather than once per route change.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
