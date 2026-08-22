import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AdminDashboard } from './features/admin/AdminDashboard';
import { AdminLogin } from './features/auth/components/LoginForm/AdminLogin';

// Componente interno para ter acesso ao hook useNavigate dentro do Router
function AppRoutes() {
  // Como usamos cookies, controlamos se está autenticado (true/false)
  // Ou você pode verificar se o cookie existe (se não for HttpOnly no client-side)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    // Se quiser manter uma flag simples no localStorage apenas para controle de tela, 
    // ou validar direto. Vamos usar uma flag simples de controle:
    return localStorage.getItem('@EcommerceAdmin:logged') === 'true';
  });
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(false);
  }, []);

  if (loading) {
    return null;
  }

  const handleLoginSuccess = () => {
    localStorage.setItem('@EcommerceAdmin:logged', 'true'); // Flag leve apenas para saber que logou
    setIsAuthenticated(true);
    navigate('/', { replace: true }); // Redireciona imediatamente para o dashboard
  };

  return (
    <Routes>
      {/* Rota de Login */}
      <Route 
        path="/login" 
        element={!isAuthenticated ? <AdminLogin onLoginSuccess={handleLoginSuccess} /> : <Navigate to="/" replace />} 
      />

      {/* Rota principal do Admin: Protegida */}
      <Route 
        path="/" 
        element={isAuthenticated ? <AdminDashboard /> : <Navigate to="/login" replace />} 
      />

      {/* Rota alternativa /dashboard: Também protegida */}
      <Route 
        path="/dashboard" 
        element={isAuthenticated ? <AdminDashboard /> : <Navigate to="/login" replace />} 
      />

      {/* Redireciona qualquer rota inexistente */}
      <Route path="*" element={<Navigate to={isAuthenticated ? "/" : "/login"} replace />} />
    </Routes>
  );
}

function App() {
  return (
    <Router>
      <AppRoutes />
    </Router>
  );
}

export default App;