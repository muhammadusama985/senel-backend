const fs = require('fs');
const path = require('path');

class FileUtils {
    /**
     * Generate public URL for uploaded file
     * Always uses https:// to avoid mixed-content warnings.
     * (Cloudflare terminates SSL and forwards to backend as HTTP internally,
     * so req.protocol would otherwise return 'http'.)
     */
    static getFileUrl(req, filename, subfolder = 'vendor') {
        const host = req.get('host');
        const baseUrl = `https://${host}`;
        return `${baseUrl}/uploads/${subfolder}/${filename}`;
    }

    /**
     * Delete file if exists
     */
    static deleteFile(filePath) {
        if (!filePath) return false;
        
        // Extract relative path from URL if it's a full URL
        let relativePath = filePath;
        if (filePath.startsWith('http')) {
            const urlParts = filePath.split('/uploads/');
            if (urlParts.length > 1) {
                relativePath = path.join(__dirname, '../../uploads', urlParts[1]);
            }
        }
        
        try {
            if (fs.existsSync(relativePath)) {
                fs.unlinkSync(relativePath);
                return true;
            }
        } catch (error) {
            console.error('Error deleting file:', error);
        }
        return false;
    }
}

module.exports = FileUtils;