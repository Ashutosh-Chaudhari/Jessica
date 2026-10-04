import { Routes, Route, Navigate } from "react-router";
import { useAuth } from "./hooks/useAuth";
import { LoadingState } from "./components/primitives";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import Challenge from "./pages/Challenge";
import Result from "./pages/Result";
import History from "./pages/History";
import Profile from "./pages/Profile";
import Progress from "./pages/Progress";

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState label="Loading Jessica" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <Landing />} />
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route path="/signup" element={user ? <Navigate to="/dashboard" replace /> : <Signup />} />
      <Route path="/dashboard" element={user ? <Dashboard /> : <Navigate to="/login" replace />} />
      <Route path="/challenge" element={user ? <Challenge /> : <Navigate to="/login" replace />} />
      <Route path="/result/:attemptId" element={user ? <Result /> : <Navigate to="/login" replace />} />
      <Route path="/history" element={user ? <History /> : <Navigate to="/login" replace />} />
      <Route path="/progress" element={user ? <Progress /> : <Navigate to="/login" replace />} />
      <Route path="/profile" element={user ? <Profile /> : <Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
