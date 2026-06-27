import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Clients from './pages/Clients.jsx';
import Projects from './pages/Projects.jsx';
import ProjectDetail from './pages/ProjectDetail.jsx';
import Users from './pages/Users.jsx';
import Tasks from './pages/Tasks.jsx';
import Calendar from './pages/Calendar.jsx';
import Profile from './pages/Profile.jsx';
import Chat from './pages/Chat.jsx';
import Blog from './pages/Blog.jsx';
import { PublicBlogList, PublicBlogPost } from './pages/PublicBlog.jsx';
import Landing from './pages/Landing.jsx';
import Appointments from './pages/Appointments.jsx';
import MyAppointments from './pages/MyAppointments.jsx';
import Notifications from './pages/Notifications.jsx';
import AuditLog from './pages/AuditLog.jsx';
import './styles/public.css';
import './styles/landing.css';
import './styles/notifications.css';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="center">Cargando...</div>;
  return user ? children : <Navigate to="/login" />;
}

function AdminRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="center">Cargando...</div>;
  if (!user) return <Navigate to="/login" />;
  if (user.role !== 'admin') return <Navigate to="/dashboard" />;
  return children;
}

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        {/* Public landing (no auth) */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/agendar" element={<Landing />} />

        {/* Public blog — no auth required */}
        <Route path="/public/blog" element={<PublicBlogList />} />
        <Route path="/public/blog/" element={<PublicBlogList />} />
        <Route path="/public/blog/:slug" element={<PublicBlogPost />} />
        <Route path="/public/blog/:slug/" element={<PublicBlogPost />} />

        {/* Private app */}
        <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        <Route path="/clients" element={<PrivateRoute><Clients /></PrivateRoute>} />
        <Route path="/projects" element={<PrivateRoute><Projects /></PrivateRoute>} />
        <Route path="/proyectos" element={<PrivateRoute><Projects /></PrivateRoute>} />
        <Route path="/proyectos/:id" element={<PrivateRoute><ProjectDetail /></PrivateRoute>} />
        <Route path="/users" element={<PrivateRoute><Users /></PrivateRoute>} />
        <Route path="/tasks" element={<PrivateRoute><Tasks /></PrivateRoute>} />
        <Route path="/calendar" element={<PrivateRoute><Calendar /></PrivateRoute>} />
        <Route path="/chat" element={<PrivateRoute><Chat /></PrivateRoute>} />
        <Route path="/profile" element={<PrivateRoute><Profile /></PrivateRoute>} />
        <Route path="/blog" element={<PrivateRoute><Blog /></PrivateRoute>} />
        <Route path="/notifications" element={<PrivateRoute><Notifications /></PrivateRoute>} />
        <Route path="/appointments" element={<PrivateRoute><Appointments /></PrivateRoute>} />
        <Route path="/my-appointments" element={<PrivateRoute><MyAppointments /></PrivateRoute>} />
        <Route path="/audit-log" element={<AdminRoute><AuditLog /></AdminRoute>} />

        <Route path="*" element={<Navigate to="/dashboard" />} />
      </Routes>
    </ErrorBoundary>
  );
}
