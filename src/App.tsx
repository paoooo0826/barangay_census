import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Clock3 } from 'lucide-react';
import { useAuth } from './context/AuthContext';

import UserTypeSelection from './pages/UserTypeSelection';
import ResidentAuth from './pages/ResidentAuth';
import ResidentRegistration from './pages/ResidentRegistration';
import CensusForm from './pages/CensusForm';
import ResidentDashboard from './pages/ResidentDashboard';
import ResetPassword from './pages/ResetPassword';
import AdminAuth from './pages/AdminAuth';
import AdminSetup from './pages/AdminSetup';
import AdminDashboard from './pages/AdminDashboard';
import AdminReview from './pages/AdminReview';

function currentRoute() {
  const hash = window.location.hash.slice(1);
  const route = hash || '/';
  return route.startsWith('/') ? route : `/${route}`;
}

function routePath(route: string) {
  return route.split('?')[0];
}

export default function App() {
  const [route, setRoute] = useState(currentRoute);

  useEffect(() => {
    const handleRouteChange = () => setRoute(currentRoute());
    window.addEventListener('hashchange', handleRouteChange);
    return () => window.removeEventListener('hashchange', handleRouteChange);
  }, []);

  const navigate = useCallback((destination: string) => {
    const normalized = destination.startsWith('/')
      ? destination
      : `/${destination}`;

    if (currentRoute() === normalized) return;
    window.location.hash = normalized;
  }, []);

  const path = routePath(route);
  const reviewMatch = path.match(/^\/admin\/review\/([^/]+)$/);
  const isPasswordReset = new URLSearchParams(window.location.search).get('password-reset') === '1';

  let page: ReactNode;

  if (isPasswordReset) {
    page = (
      <ResetPassword
        onComplete={() => {
          window.history.replaceState({}, '', `${import.meta.env.BASE_URL}#/resident`);
          setRoute('/resident');
        }}
      />
    );
  } else if (path === '/') {
    page = (
      <UserTypeSelection
        onResident={() => navigate('/resident')}
        onAdmin={() => navigate('/admin')}
      />
    );
  } else if (path === '/resident') {
    page = (
      <ResidentAuth
        onBack={() => navigate('/')}
        onLoginSuccess={(destination) =>
          navigate(
            destination === 'dashboard'
              ? '/resident/dashboard'
              : '/resident/census',
          )
        }
        onRegisterClick={() => navigate('/resident/register')}
      />
    );
  } else if (path === '/resident/register') {
    page = (
      <ResidentRegistration
        email=""
        onDashboard={() => navigate('/resident/census')}
        onBack={() => navigate('/resident')}
      />
    );
  } else if (path === '/resident/census') {
    page = (
      <CensusForm
        onDashboard={() => navigate('/resident/dashboard')}
        onLogout={() => navigate('/')}
      />
    );
  } else if (path === '/resident/dashboard') {
    page = (
      <ResidentDashboard
        onLogout={() => navigate('/')}
        onEdit={() => navigate('/resident/census?mode=edit')}
      />
    );
  } else if (path === '/admin') {
    page = (
      <AdminAuth
        onBack={() => navigate('/')}
        onLoginSuccess={() => navigate('/admin/dashboard')}
      />
    );
  } else if (path === '/admin/setup') {
    page = <AdminSetup onNavigate={navigate} />;
  } else if (path === '/admin/dashboard') {
    page = (
      <AdminDashboard
        onLogout={() => navigate('/')}
        onReview={(id) => navigate(`/admin/review/${id}`)}
      />
    );
  } else if (reviewMatch) {
    page = (
      <AdminReview
        residentId={decodeURIComponent(reviewMatch[1])}
        onBack={() => navigate('/admin/dashboard')}
        onDecisionComplete={() => navigate('/admin/dashboard')}
      />
    );
  } else {
    page = (
      <UserTypeSelection
        onResident={() => navigate('/resident')}
        onAdmin={() => navigate('/admin')}
      />
    );
  }

  return (
    <>
      <InactivityTimer />
      {page}
    </>
  );
}

function InactivityTimer() {
  const { user, inactivitySecondsRemaining } = useAuth();

  if (!user || inactivitySecondsRemaining === null) return null;

  const minutes = Math.floor(inactivitySecondsRemaining / 60);
  const seconds = inactivitySecondsRemaining % 60;
  const isWarning = inactivitySecondsRemaining <= 60;

  return (
    <div
      className={`fixed right-4 top-4 z-[100] flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold shadow-lg backdrop-blur-sm ${
        isWarning
          ? 'border-red-200 bg-red-50/95 text-red-700'
          : 'border-slate-200 bg-white/95 text-slate-700'
      }`}
      title="This account will automatically sign out after 15 minutes without activity."
    >
      <Clock3 className="h-4 w-4" />
      <span>
        {isWarning ? 'Auto logout in ' : 'Session: '}
        {minutes}:{String(seconds).padStart(2, '0')}
      </span>
    </div>
  );
}
