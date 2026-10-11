"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseUpload = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const uploadDir = path_1.default.join(__dirname, '../../uploads');
if (!fs_1.default.existsSync(uploadDir)) {
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => { cb(null, uploadDir); },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path_1.default.extname(file.originalname).toLowerCase());
    }
});
const fileFilter = (req, file, cb) => {
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.jfif'];
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jfif'];
    const extension = path_1.default.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(extension) && allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    }
    else {
        cb(new Error('Formato inválido! Use apenas JPG, PNG, WEBP ou JFIF.'), false);
    }
};
const upload = (0, multer_1.default)({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }
});
// NOVA VERSÃO: Usa upload.any() para aceitar os campos dinâmicos por cor (`imagens_${corId}`)
const parseUpload = () => {
    const uploadAction = upload.any();
    return (req, res, next) => {
        uploadAction(req, res, (err) => {
            if (err) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({ message: 'Erro: Uma ou mais imagens excedem 5MB.' });
                }
                return res.status(400).json({ message: err.message });
            }
            next();
        });
    };
};
exports.parseUpload = parseUpload;
exports.default = upload;
