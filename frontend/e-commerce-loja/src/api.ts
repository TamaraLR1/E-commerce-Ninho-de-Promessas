import axios from 'axios';

const api = axios.create({
  baseURL: 'https://ninhoback.tamaralr.com.br', // Ou http://localhost:3001 caso esteja testando localmente
  withCredentials: true, // ESSENCIAL: Permite o envio automático dos cookies HttpOnly de autenticação
});

export default api;