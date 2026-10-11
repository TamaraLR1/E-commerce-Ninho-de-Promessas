"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.API_URL = void 0;
// src/config/api.ts
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
exports.API_URL = isLocal
    ? 'http://localhost:3333'
    : 'https://ninhoback.tamaralr.com.br';
