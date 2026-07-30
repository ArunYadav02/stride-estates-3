import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '../lib/auth';
import { ThemeProvider } from '../lib/theme';
import { ToastProvider } from '../design-system';
import { useAsync } from '../lib/hooks';
import { api } from '../lib/api';
import AppShell from '../layout/AppShell';
import LoginPage from '../features/auth/LoginPage';
import DashboardPage from '../features/dashboard/DashboardPage';
import PropertiesPage from '../features/properties/PropertiesPage';
import PropertyPage from '../features/properties/PropertyPage';
import ApplicantsPage from '../features/applicants/ApplicantsPage';
import DiaryPage from '../features/diary/DiaryPage';
import CompliancePage from '../features/compliance/CompliancePage';
import MaintenancePage from '../features/maintenance/MaintenancePage';
import DocumentsPage from '../features/documents/DocumentsPage';
import StudioPage from '../features/listings/StudioPage';
import ConciergePage from '../features/concierge/ConciergePage';
import SalesPage from '../features/sales/SalesPage';

function SignedIn() {
  // One shared fetch so the sidebar can badge compliance without every page
  // asking for it again.
  const { data } = useAsync(() => api.compliance(), []);
  const alerts = {
    compliance: (data?.summary?.expired || 0) + (data?.summary?.urgent || 0),
  };

  return (
    <Routes>
      <Route element={<AppShell alerts={alerts} />}>
        <Route index element={<DashboardPage />} />
        <Route path="properties" element={<PropertiesPage />} />
        <Route path="properties/:id" element={<PropertyPage />} />
        <Route path="applicants" element={<ApplicantsPage />} />
        <Route path="diary" element={<DiaryPage />} />
        <Route path="compliance" element={<CompliancePage />} />
        <Route path="maintenance" element={<MaintenancePage />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="studio" element={<StudioPage />} />
        <Route path="concierge" element={<ConciergePage />} />
        <Route path="sales" element={<SalesPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function Gate() {
  const { status } = useAuth();
  if (status === 'loading') return null;
  return status === 'signed-in' ? <SignedIn /> : <LoginPage />;
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <BrowserRouter>
          <AuthProvider>
            <Gate />
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  );
}
