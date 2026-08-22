import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const adapter = new PrismaMariaDb({
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: '123456',
  database: 'ninho_de_promessas',
  connectionLimit: 10,
  allowPublicKeyRetrieval: true,
  ssl: false,
});

export const prisma = new PrismaClient({ adapter });