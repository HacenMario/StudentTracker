const QRCode = require('qrcode');

/**
 * توليد QR Code كنص (للتخزين) أو كصورة (للعرض)
 * @param {string} text - النص الذي سيتم ترميزه
 * @param {string} type - 'dataURL' (للعرض) أو 'string' (للتخزين)
 * @returns {Promise<string>}
 */
async function generateQR(text, type = 'dataURL') {
  try {
    if (type === 'dataURL') {
      // توليد صورة QR كـ Data URL (يمكن عرضها في <img>)
      return await QRCode.toDataURL(text);
    } else {
      // توليد نص QR فقط (للتخزين)
      return text;
    }
  } catch (err) {
    throw new Error('فشل توليد QR Code: ' + err.message);
  }
}

module.exports = { generateQR };
