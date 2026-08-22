import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import { authRoutes } from './routes/authRoutes';
import adminRoutes from './routes/adminRoutes';
import categoriaRoutes from './routes/categoriaRoutes';
import tamanhoRoutes from './routes/tamanhoRoutes';
import corRoutes from './routes/corRoutes';
import {produtoRoutes} from './routes/produtoRoutes';
import estoqueRoutes from './routes/estoqueRoutes';
import motivoRoutes from './routes/motivoRoutes';

import path from 'path';

dotenv.config();

const app = express();
const UPLOADS_PATH = path.join(__dirname, '..', 'uploads');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(cors({
  origin: ['http://localhost:5173','http://localhost:5174'], // A URL exata onde o seu frontend está rodando
  credentials: true                // Permite o envio e recebimento de cookies HTTP-only
}));

app.use('/uploads', express.static(UPLOADS_PATH));
app.use('/api', authRoutes);
app.use('/api', adminRoutes);
app.use('/api', categoriaRoutes);
app.use('/api', tamanhoRoutes);
app.use('/api', corRoutes);
app.use('/api', produtoRoutes);
app.use('/api', estoqueRoutes);
app.use('/api', motivoRoutes);

const PORT = process.env.PORT || 3333;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});