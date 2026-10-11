"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const client_1 = require("@prisma/client");
const adapter_mariadb_1 = require("@prisma/adapter-mariadb");
const adapter = new adapter_mariadb_1.PrismaMariaDb({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '123456',
    database: 'ninho_de_promessas',
    connectionLimit: 10,
    allowPublicKeyRetrieval: true,
    ssl: false,
});
exports.prisma = new client_1.PrismaClient({ adapter });
