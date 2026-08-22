import React, { useState } from 'react';
import styles from './Checkout.module.css'; 

export const CheckoutModal: React.FC<{ onClose: () => void, total: number }> = ({ onClose, total }) => {
  const [step, setStep] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'card' | null>(null);

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.cartModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.cartHeader}>
          <h2>Finalizar Compra - Etapa {step} de 3</h2>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>

        {step === 1 && (
          <div className={styles.cartList}>
            <h3>Endereço de Entrega</h3>
            <input type="text" placeholder="Rua" className={styles.inputField} />
            <input type="text" placeholder="Número" className={styles.inputField} />
            <input type="text" placeholder="CEP" className={styles.inputField} />
            <input type="text" placeholder="Bairro" className={styles.inputField} />
            <input type="text" placeholder="Cidade" className={styles.inputField} />
            <button className={styles.actionButton} onClick={() => setStep(2)}>Continuar</button>
          </div>
        )}

        {step === 2 && (
          <div className={styles.cartList}>
            <h3>Informações de Entrega</h3>
            <p>Data prevista para entrega: <strong>{new Date(Date.now() + 86400000 * 3).toLocaleDateString()}</strong></p>
            <button className={styles.actionButton} onClick={() => setStep(3)}>Avançar para Pagamento</button>
          </div>
        )}

        {step === 3 && (
          <div className={styles.cartList}>
            <h3>Escolha o Pagamento</h3>
            <div className={styles.paymentOptions}>
              <button onClick={() => setPaymentMethod('pix')}>PIX</button>
              <button onClick={() => setPaymentMethod('card')}>Cartão</button>
            </div>
            
            {paymentMethod === 'pix' && <p>Chave Pix: <strong>123.456.789-00</strong></p>}
            {paymentMethod === 'card' && <input type="text" placeholder="Número do Cartão" className={styles.inputField} />}
            
            <button className={styles.actionButton} style={{marginTop: '1rem'}} onClick={() => alert('Pedido realizado!')}>
              Confirmar Pagamento
            </button>
          </div>
        )}
      </div>
    </div>
  );
};