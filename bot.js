const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');

// KONFIGURASI KEAMANAN
const ALLOWED_IDS = [
    '6282234841594@c.us',
    '213279586689122@lid', // Kode unik khusus milik Anda
    '6282234841594'
];
const API_TOKEN = 'Bearer RAHASIA_HEMATCUY_123';
const API_URL = 'https://hematcuy.com/api/bot/transaction';

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: '.wwebjs_auth_v2' })
});

client.on('qr', (qr) => {
    console.log('Scan QR Code ini dengan WhatsApp Anda:');
    qrcode.generate(qr, {small: true});
});

client.on('ready', () => {
    console.log('Client is ready!');
    console.log('Bot WhatsApp aman berjalan. Menunggu instruksi dari Pemilik.');
});

client.on('message_create', async msg => {
    const text = msg.body || '';
    
    // KEAMANAN LAPIS 1: Penggunaan Hashtag Sumber Dana (#Bank atau #Tunai)
    const textLower = text.toLowerCase();
    if (!textLower.includes('#bank') && !textLower.includes('#tunai') && !textLower.includes('#cash')) {
        return;
    }

    // Biarkan '#' dikirim ke Laravel agar diproses
    const cleanText = text.trim();

    console.log(`[DITERIMA] Akses Valid! Pesan: ${cleanText}`);

    if (cleanText.toLowerCase().startsWith('pemasukan') || cleanText.toLowerCase().startsWith('pengeluaran') || cleanText.toLowerCase().startsWith('masuk') || cleanText.toLowerCase().startsWith('keluar')) {
        try {
            // KEAMANAN LAPIS 2: Mengirim API Token rahasia ke server Laravel
            const response = await axios.post(API_URL, {
                message: cleanText
            }, {
                headers: {
                    'Authorization': API_TOKEN,
                    'Content-Type': 'application/json'
                }
            });

            if (response.data && response.data.success) {
                msg.reply('✅ ' + response.data.message);
            }
        } catch (error) {
            console.error(error.message);
            if (error.response && error.response.data && error.response.data.error) {
                msg.reply('❌ Gagal: ' + error.response.data.error);
            } else {
                msg.reply('❌ Terjadi kesalahan saat menghubungi server aplikasi.');
            }
        }
    } else {
        msg.reply('🤖 Format tidak dikenali atau tidak ada Hashtag #Bank/#Tunai.\n\nGunakan format:\n*Pemasukan/Pengeluaran* [Nominal] [Judul] #[Bank/Tunai]\n\nContoh:\nPengeluaran 20000 Makan Siang #Bank\nPemasukan 50000 Dikasih Ibu #Tunai');
    }
});

client.initialize();
