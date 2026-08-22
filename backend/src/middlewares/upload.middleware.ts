import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request, Response, NextFunction } from 'express';

const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, uploadDir); },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname).toLowerCase());
    }
});

const fileFilter = (req: any, file: any, cb: any) => {
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.jfif'];
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jfif'];

    const extension = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(extension) && allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Formato inválido! Use apenas JPG, PNG, WEBP ou JFIF.'), false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } 
});

// NOVA FUNÇÃO EXPORTADA: Encapsula a responsabilidade do tratamento de erro
export const parseUpload = (fieldName: string, maxFiles: number) => {
    const uploadAction = upload.array(fieldName, maxFiles);

    return (req: Request, res: Response, next: NextFunction) => {
        uploadAction(req, res, (err: any) => {
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

export default upload;