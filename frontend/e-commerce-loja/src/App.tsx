import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Home } from './features/ecommerce/components/Home/Home';
import { LoginForm } from './features/auth/components/LoginForm/LoginForm';
import { RegisterForm } from './features/auth/components/LoginForm/RegisterForm';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Rota principal livre para a vitrine do e-commerce */}
        <Route path="/" element={<Home />} />
        
        {/* Rotas de autenticação acessadas via navegação */}
        <Route path="/login" element={<LoginForm />} />
        <Route path="/cadastro" element={<RegisterForm />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;