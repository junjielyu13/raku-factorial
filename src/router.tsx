// src/router.tsx
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { LoginPage } from './auth/LoginPage';
import { RequireAuth } from './auth/RequireAuth';
import { EmployeeHome } from './employee/EmployeeHome';
import { EmployeeHistory } from './employee/EmployeeHistory';
import { SubmitEditRequest } from './employee/SubmitEditRequest';
import { AdminDashboard } from './admin/AdminDashboard';
import { AdminApprovals } from './admin/AdminApprovals';
import { AdminExport } from './admin/AdminExport';

export const router = createBrowserRouter([
  { path: '/login',          element: <LoginPage /> },
  { path: '/',               element: <RequireAuth><EmployeeHome /></RequireAuth> },
  { path: '/history',        element: <RequireAuth><EmployeeHistory /></RequireAuth> },
  { path: '/submit-edit',    element: <RequireAuth><SubmitEditRequest /></RequireAuth> },
  { path: '/admin',          element: <RequireAuth adminOnly><AdminDashboard /></RequireAuth> },
  { path: '/admin/approvals', element: <RequireAuth adminOnly><AdminApprovals /></RequireAuth> },
  { path: '/admin/export',   element: <RequireAuth adminOnly><AdminExport /></RequireAuth> },
  { path: '*',               element: <Navigate to="/" replace /> },
]);
