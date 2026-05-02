const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const app = express();
const PORT = process.env.PORT || 3000;

async function scrapeKBBI(kata, isRetry = false) {
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

        let hasil = [];
        let currentEntri = null;

        $('.container.body-content').contents().each((i, el) => {
            const tagName = el.tagName;

            // 1. Deteksi Judul Kata (H2)
                        if (tagName === 'h2') {
                if (currentEntri) hasil.push(currentEntri);
                
                const judul = $(el);
                currentEntri = {
                    nama: judul.contents().filter(function() { return this.nodeType === 3; }).text().trim(),
                    nomor: judul.find('sup').text().trim() || null,
                    makna: []
                };

                // TRIK BARU: Ambil teks "prakategorial" atau info tambahan tepat setelah H2
                // Jika setelah H2 ada tag <font> atau <i> sebelum ketemu <ol>/<ul>
                let nextElem = judul.next();
                while (nextElem.length && !['h2', 'ol', 'ul', 'hr'].includes(nextElem[0].tagName)) {
                    let infoTeks = nextElem.text().trim();
                    if (infoTeks && infoTeks.length > 3) {
                        currentEntri.makna.push(infoTeks);
                    }
                    nextElem = nextElem.next();
                }
            }

            // 2. Deteksi Daftar Makna (OL atau UL)
            if ((tagName === 'ol' || tagName === 'ul') && currentEntri) {
                $(el).find('li').each((idx, li) => {
                    // Hapus elemen yang bukan bagian dari definisi (tombol, link usulkan, dsb)
                    $(li).find('.entrisButton, button, a').remove();

                    // Ambil teks makna dan bersihkan spasi
                    let m = $(li).text().replace(/\s+/g, ' ').trim();

                    // Daftar kalimat sampah/promosi untuk dibuang
                    const sampah = [
                        "memudahkan pencarian Anda",
                        "hak berpartisipasi dalam pengayaan",
                        "menampilkan hasil pencarian dengan tambahan informasi",
                        "usulkan makna baru"
                    ];

                    // Cek apakah teks mengandung sampah
                    const isSampah = sampah.some(s => m.toLowerCase().includes(s.toLowerCase()));

                    // Hanya masukkan jika ada teks dan bukan sampah
                    if (m && !isSampah) {
                        currentEntri.makna.push(m);
                    }
                });
            }
        });

        // Push entri terakhir ke hasil
        if (currentEntri) hasil.push(currentEntri);

        // --- LOGIKA LONCAT START ---
        if (!isRetry && hasil.length > 0 && hasil[0].makna.length > 0) {
            const maknaPertama = hasil[0].makna[0];
            if (maknaPertama.includes('→')) {
                const kataBaku = maknaPertama.replace('→', '').trim().split(' ')[0];
                return await scrapeKBBI(kataBaku, true); 
            }
        }
        // --- LOGIKA LONCAT END ---

        // Jika hasil kosong tapi tidak ada pesan error dari KBBI
        if (hasil.length === 0) return { error: "Kata tidak ditemukan" };

        return { data: hasil };

    } catch (error) {
        return { error: "Gagal menghubungi server KBBI" };
    }
}

// Endpoint API
app.get('/kbbi', async (req, res) => {
    const kata = req.query.kata;
    if (!kata) return res.status(400).json({ error: "Parameter 'kata' diperlukan" });

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
