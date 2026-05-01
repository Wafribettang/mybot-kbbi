const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const app = express();
const PORT = process.env.PORT || 3000;

async function scrapeKBBI(kata) {
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

            // Jika ketemu judul (H2)
            if (tagName === 'h2') {
                if (currentEntri) hasil.push(currentEntri);
                currentEntri = {
                    nama: $(el).contents().filter(function() { return this.nodeType === 3; }).text().trim(),
                    nomor: $(el).find('sup').text().trim() || null,
                    makna: []
                };
            }

            // Jika ketemu daftar makna
            if ((tagName === 'ol' || tagName === 'ul') && currentEntri) {
                $(el).find('li').each((idx, li) => {
                    $(li).find('.entrisButton, button').remove();
                    let m = $(li).text().replace(/\s+/g, ' ').trim();
                    if (m && !m.toLowerCase().includes("usulkan makna")) {
                        currentEntri.makna.push(m);
                    }
                });
            }
        });

        if (currentEntri) hasil.push(currentEntri);
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

app.listen(PORT, () => {
    console.log(`API KBBI berjalan di http://localhost:${PORT}`);
});
