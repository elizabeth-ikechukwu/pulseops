// src/App.tsx — routing shell. Five routes, matching the five pages.

import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider, RequireAuth } from './auth/AuthContext';
import LoginPage from './pages/LoginPage';
import IncidentsPage from './pages/IncidentsPage';
import IncidentDetailPage from './pages/IncidentDetailPage';
import DashboardPage from './pages/DashboardPage';
import PostmortemPage from './pages/PostmortemPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<RequireAuth><IncidentsPage /></RequireAuth>} />
          <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
          <Route path="/incidents/:id" element={<RequireAuth><IncidentDetailPage /></RequireAuth>} />
          <Route
            path="/incidents/:id/postmortem"
            element={<RequireAuth><PostmortemPage /></RequireAuth>}
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
