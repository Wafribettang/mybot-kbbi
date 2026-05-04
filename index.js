const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const app = express();
const PORT = process.env.PORT || 3000;

async function scrapeKBBI(kata, isRetry = false, kataAsli = null) {
    try {
        const url = `https://kbbi.kemendikdasmen.go.id/entri/${encodeURIComponent(kata)}`;
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
            }
        });

        const $ = cheerio.load(data);
        const pesanError = $('#errorMessageDiv').text().trim();
        if (pesanError) return { error: pesanError };
        
        const isiBody = $('.container.body-content').text();
        if (isiBody.includes("Entri tidak ditemukan")) {
            return { error: "Kata tidak ditemukan" };
        }

        let hasil = [];
        let currentEntri = null;

        $('.container.body-content').contents().each((i, el) => {
            const tagName = el.tagName;

            if (tagName === 'h2') {
                if (currentEntri) hasil.push(currentEntri);
                const judul = $(el);
                currentEntri = {
                    nama: judul.contents().filter(function() { return this.nodeType === 3; }).text().trim(),
                    nomor: judul.find('sup').text().trim() || null,
                    info: null,
                    makna: []
                };

                // Ambil info setelah H2 (Prakategorial dll)
                let nextElem = judul.next();
                while (nextElem.length && !['h2', 'ol', 'ul', 'hr'].includes(nextElem[0].tagName)) {
                    // Hapus link Tesaurus di tahap ini
                    nextElem.find('a:contains("Tesaurus"), .entrisButton').remove();
                    
                    let infoTeks = nextElem.text().trim().replace(/\s+/g, ' ');
                    
                    // Filter: Jangan masukkan jika teks mengandung Tesaurus atau cuma simbol panah
                    if (infoTeks && !infoTeks.includes('Tesaurus') && infoTeks.length > 1) {
                        currentEntri.makna.push(infoTeks);
                    }
                    nextElem = nextElem.next();
                }
            }

            if ((tagName === 'ol' || tagName === 'ul') && currentEntri) {
                $(el).find('li').each((idx, li) => {
                    // Hapus link Tesaurus dan tombol usulkan
                    $(li).find('a:contains("Tesaurus"), .entrisButton, button').remove();
                    
                    let m = $(li).text().replace(/\s+/g, ' ').trim();
                    const sampah = ["memudahkan pencarian Anda", "hak berpartisipasi dalam pengayaan", "usulkan makna baru", "menampilkan hasil pencarian dengan tambahan informasi yang lebih lengkap (misalnya, informasi etimologi)"];
                    const isSampah = sampah.some(s => m.toLowerCase().includes(s.toLowerCase()));

                    if (m && !isSampah) {
                        currentEntri.makna.push(m);
                    }
                });
            }
        });

        if (currentEntri) hasil.push(currentEntri);

                        // --- LOGIKA LONCAT (Auto-Follow & Info Property) ---
        if (!isRetry && hasil.length > 0) {
            const teksRujukan = hasil[0].makna.find(m => m.includes('→') || m.includes('->'));
            
            if (teksRujukan) {
                const match = teksRujukan.match(/→\s*([a-zA-Z]+)/) || teksRujukan.match(/->\s*([a-zA-Z]+)/);
                if (match && match[1]) {
                    const kataBaku = match[1].trim();
                    // Panggil ulang dengan membawa parameter kata asli
                    return await scrapeKBBI(kataBaku, true, kata); 
                }
            }
        }

        // Jika ini hasil loncatan, timpa nama dan isi properti info
        if (isRetry && kataAsli && hasil.length > 0) {
            hasil = hasil.map(entry => ({
                ...entry,
                nama: kataAsli, // Tetap gunakan kata yang diketik user (jendral)
                info: `Bentuk tidak baku dari ${kata}` // Masuk ke properti info, bukan makna
            }));
        }

        return { data: hasil.length > 0 ? hasil : [{ error: "Kata tidak ditemukan" }] };

    } catch (error) {
        return { error: "Gagal menghubungi server" };
    }
}

// Endpoint API
app.get('/kbbi', async (req, res) => {
    const kata = req.query.kata;
    if (!kata) return res.status(400).json({ error: "Parameter 'kata' diperlukan" });

    // Cukup panggil tanpa kataAsli, karena kataAsli akan diisi otomatis saat loncat
    const result = await scrapeKBBI(kata); 
    res.json(result);
});

// Endpoint untuk halaman utama agar tidak 404
app.get('/', (req, res) => {
    res.send("API KBBI Berhasil Online! Gunakan path /kbbi?kata=namakata");
});

app.listen(PORT, () => {
    console.log(`API KBBI berjalan di port ${PORT}`);
});
