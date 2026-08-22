import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

interface TokenPayload {
  id: string;
  iat: number;
  exp: number;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // Lê o token diretamente do cookie HTTP-only enviado pelo navegador
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({ error: 'Token não fornecido.' });
  }

  try {
    const secret = process.env.JWT_SECRET || 'seu_segredo_jwt_padrao';
    const decoded = jwt.verify(token, secret) as TokenPayload;

    req.userId = Number(decoded.id);
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido.' });
  }
}