const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcodeImg = require('qrcode');
const axios = require('axios');
const express = require('express');

// Bikin server untuk menampilkan QR Code di web
const app = express();
const port = process.env.PORT || 10000;

let latestQr = '';
let isReady = false;

app.get('/', async (req, res) => {
    if (isReady) {
        res.send('<h1 style="font-family: sans-serif; color: green; text-align: center; margin-top: 50px;">✅ Bot WhatsApp sedang berjalan!</h1>');
    } else if (latestQr) {
        try {
            const url = await qrcodeImg.toDataURL(latestQr);
            res.send(`
                <div style="text-align: center; font-family: sans-serif; margin-top: 50px;">
                    <h1>Scan QR Code WhatsApp</h1>
                    <p>Buka WhatsApp di HP Anda > Perangkat Tertaut > Tautkan Perangkat</p>
                    <img src="${url}" alt="QR Code" style="border: 2px solid #ccc; border-radius: 10px; padding: 10px;"/>
                </div>
            `);
        } catch (err) {
            res.send('Sedang memproses gambar QR...');
        }
    } else {
        res.send('<h1 style="font-family: sans-serif; text-align: center; margin-top: 50px;">⏳ Tunggu sebentar, sedang menyiapkan QR Code... Refresh halaman ini beberapa saat lagi.</h1>');
    }
});
app.listen(port, () => console.log(`Dummy server listening on port ${port}!`));

// KONFIGURASI KEAMANAN DARI ENVIRONMENT VARIABLES
const rawAllowedIds = process.env.ALLOWED_IDS || '';
const ALLOWED_IDS = rawAllowedIds.split(',');
const API_TOKEN = process.env.API_TOKEN || 'Bearer RAHASIA_HEMATCUY_123';
const API_URL = process.env.API_URL || 'https://hematcuy.com/api/bot/transaction';

async function connectToWhatsApp () {
    const { state, saveCreds } = await useMultiFileAuthState('.baileys_auth_info');
    
    // Inisialisasi mesin Baileys yang jauh lebih ringan dari Puppeteer
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }), // Matikan log bawaan yang terlalu panjang
        browser: Browsers.ubuntu('Chrome')
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            latestQr = qr;
            console.log('============= PERHATIAN =============');
            console.log('Silakan buka alamat Website aplikasi Railway Anda untuk melihat QR Code yang jelas!');
            console.log('=====================================');
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Koneksi terputus karena ', lastDisconnect.error, ', mencoba menyambung kembali: ', shouldReconnect);
            if(shouldReconnect) {
                connectToWhatsApp();
            }
        } else if(connection === 'open') {
            isReady = true;
            console.log('Client is ready!');
            console.log('Bot WhatsApp aman berjalan. Menunggu instruksi dari Pemilik.');
        }
    });

    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if (!msg.message) return; // Abaikan jika bukan pesan
        
        // Ekstrak teks dari pesan biasa atau caption gambar
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        if (!text) return;
        
        const from = msg.key.remoteJid;
        
        // Di Baileys, ID Anda sendiri berakhiran @s.whatsapp.net
        const myId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        const isSelfChat = msg.key.fromMe || (from === myId);
        
        console.log(`[DEBUG] Pesan masuk dari: ${from} | fromMe: ${msg.key.fromMe} | Teks: ${text}`);

        if (ALLOWED_IDS.length === 0 || ALLOWED_IDS[0] === '') {
            console.log('Peringatan: ALLOWED_IDS belum disetting di Railway!');
            return;
        }

        // Cek ID (pastikan support @c.us untuk kompatibilitas lama, dan @s.whatsapp.net untuk format Baileys)
        const isAllowedSender = ALLOWED_IDS.includes(from) || 
                                ALLOWED_IDS.includes(from.replace('@s.whatsapp.net', '')) ||
                                ALLOWED_IDS.includes(from.replace('@c.us', ''));

        if (!isAllowedSender && !isSelfChat) {
            return;
        }

        const textLower = text.toLowerCase();
        if (!textLower.includes('#bank') && !textLower.includes('#tunai') && !textLower.includes('#cash')) {
            return;
        }

        const cleanText = text.trim();
        console.log(`[DITERIMA] Akses Valid! Pesan: ${cleanText}`);

        if (cleanText.toLowerCase().startsWith('pemasukan') || cleanText.toLowerCase().startsWith('pengeluaran') || cleanText.toLowerCase().startsWith('masuk') || cleanText.toLowerCase().startsWith('keluar')) {
            try {
                const response = await axios.post(API_URL, { message: cleanText }, {
                    headers: { 'Authorization': API_TOKEN, 'Content-Type': 'application/json' }
                });

                if (response.data && response.data.success) {
                    await sock.sendMessage(from, { text: '✅ ' + response.data.message });
                }
            } catch (error) {
                console.error(error.message);
                if (error.response && error.response.data && error.response.data.error) {
                    await sock.sendMessage(from, { text: '❌ Gagal: ' + error.response.data.error });
                } else {
                    await sock.sendMessage(from, { text: '❌ Terjadi kesalahan saat menghubungi server aplikasi.' });
                }
            }
        } else {
            await sock.sendMessage(from, { text: '🤖 Format tidak dikenali atau tidak ada Hashtag #Bank/#Tunai.\n\nGunakan format:\n*Pemasukan/Pengeluaran* [Nominal] [Judul] #[Bank/Tunai]\n\nContoh:\nPengeluaran 20000 Makan Siang #Bank\nPemasukan 50000 Dikasih Ibu #Tunai' });
        }
    });
}

connectToWhatsApp();
