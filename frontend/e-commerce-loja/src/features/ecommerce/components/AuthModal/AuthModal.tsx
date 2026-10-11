import React from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './AuthModal.module.css';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  message?: string;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  message = 'Para adicionar produtos ao carrinho e acompanhar seus pedidos, faça login na sua conta.'
}) => {
  const navigate = useNavigate();

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button type="button" className={styles.closeButton} onClick={onClose}>
          ✕
        </button>

        <div className={styles.iconContainer}>
          🛍️
        </div>

        <h3>Acesse sua Conta</h3>
        <p>{message}</p>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.loginButton}
            onClick={() => {
              onClose();
              navigate('/login');
            }}
          >
            Entrar na Minha Conta
          </button>

          <button
            type="button"
            className={styles.registerButton}
            onClick={() => {
              onClose();
              navigate('/cadastro');
            }}
          >
            Criar uma Conta Rápida
          </button>
        </div>
      </div>
    </div>
  );
};