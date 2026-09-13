import React, { useState } from 'react';
import styles from './Checkout.module.css'; 

interface CheckoutModalProps {
  onClose: () => void;
  total: number;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({ onClose, total }) => {
  const [step, setStep] = useState<number>(1);
  const [paymentMethod, setPaymentMethod] = useState<string>('pix');

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Finalizar Compra - Etapa {step} de 3</h2>
          <button type="button" className={styles.closeButton} onClick={onClose}>×</button>
        </div>

        <div className={styles.modalBody}>
          <p className={styles.totalInfo}>Total a pagar: <strong>R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></p>

          {step === 1 && (
            <div>
              <h3>Endereço de Entrega</h3>
              <p>Confirme seus dados para envio.</p>
              <button type="button" className={styles.actionButton} onClick={() => setStep(2)}>Continuar</button>
            </div>
          )}

          {step === 2 && (
            <div>
              <h3>Método de Envio</h3>
              <p>Frete padrão calculado para sua região.</p>
              <button type="button" className={styles.actionButton} onClick={() => setStep(3)}>Avançar para Pagamento</button>
            </div>
          )}

          {step === 3 && (
            <div>
              <h3>Escolha a forma de pagamento</h3>
              <div style={{ display: 'flex', gap: '10px', margin: '15px 0' }}>
                <button type="button" onClick={() => setPaymentMethod('pix')} style={{ padding: '8px 16px', background: paymentMethod === 'pix' ? '#D7B796' : '#eee', color: paymentMethod === 'pix' ? '#fff' : '#333', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>PIX</button>
                <button type="button" onClick={() => setPaymentMethod('card')} style={{ padding: '8px 16px', background: paymentMethod === 'card' ? '#D7B796' : '#eee', color: paymentMethod === 'card' ? '#fff' : '#333', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Cartão</button>
              </div>

              {paymentMethod === 'pix' && <p>Chave Pix: <strong>123.456.789-00</strong></p>}
              {paymentMethod === 'card' && <input type="text" placeholder="Número do Cartão" className={styles.inputField} />}

              <button type="button" className={styles.actionButton} style={{ marginTop: '15px', backgroundColor: '#28a745' }} onClick={() => { alert('Pedido realizado com sucesso!'); onClose(); }}>
                Finalizar Pedido
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};