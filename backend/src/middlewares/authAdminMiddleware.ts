import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_ADMIN_SECRET = process.env.JWT_SECRET_ADMIN as string;

export function ensureAdminAuthenticated(req: Request, res: Response, next: NextFunction) {
  // Pega o token diretamente dos cookies da requisição
  const token = req.cookies?.admin_token;

  if (!token) {
    return res.status(401).json({ message: 'Não autorizado. Token ausente.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_ADMIN_SECRET);
    (req as any).admin = decoded;
    return next();
  } catch (err) {
    return res.status(401).json({ message: 'Sessão expirada ou inválida.' });
  }
}