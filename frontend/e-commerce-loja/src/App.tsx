import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import ReactGA from 'react-ga4';

import { Home } from './features/ecommerce/components/Home/Home';
import { LoginForm } from './features/auth/components/LoginForm/LoginForm';
import { RegisterForm } from './features/auth/components/LoginForm/RegisterForm';
import { Perfil } from './features/ecommerce/components/Perfil/Perfil';
import { ProductDetail } from './features/ecommerce/components/ProductDetail/ProductDetail';
import './index.css';

const GA_TRACKING_ID = 'G-RE1HWQNZY4'; // 👈 O seu ID do Google Analytics

// 🔹 Inicializa o GA4 imediatamente ao carregar a aplicação
ReactGA.initialize(GA_TRACKING_ID);

function PageTracker() {
  const location = useLocation();

  useEffect(() => {
    // Envia o pageview após garantir que a sessão iniciou
    ReactGA.send({ 
      hitType: 'pageview', 
      page: location.pathname + location.search 
    });
  }, [location]);

  return null;
}

function App() {
  return (
    <BrowserRouter>
      <PageTracker />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/produto/:id" element={<ProductDetail />} />
        <Route path="/login" element={<LoginForm />} />
        <Route path="/cadastro" element={<RegisterForm />} />
        <Route path="/perfil" element={<Perfil />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;