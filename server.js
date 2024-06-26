const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const Trade = require('./models/Trade'); // Adjust path as needed

mongoose.connect('mongodb://localhost:27017/trades', { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB connected...'))
    .catch(err => console.log(err));

const app = express();
app.use(bodyParser.json());

const upload = multer({ dest: 'uploads/' });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        const filePath = req.file.path;
        const trades = [];

        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => {
                const [baseCoin, quoteCoin] = row.Market.split('/');
                trades.push({
                    utcTime: new Date(row.UTC_Time),
                    operation: row.Operation,
                    market: row.Market,
                    baseCoin,
                    quoteCoin,
                    amount: parseFloat(row['Buy/Sell Amount']),
                    price: parseFloat(row.Price)
                });
            })
            .on('end', async () => {
                try {
                    await Trade.insertMany(trades);
                    res.send('CSV file successfully processed and data stored in the database');
                } catch (err) {
                    res.status(500).send('Error storing data in the database: ' + err);
                }
            })
            .on('error', (err) => {
                res.status(500).send('Error reading CSV file: ' + err);
            });
    } catch (err) {
        res.status(500).send('Error uploading file: ' + err);
    }
});


app.post('/balance', async (req, res) => {
    try {
        const { timestamp } = req.body;
        const utcTime = new Date(timestamp);

        console.log(`Requested timestamp: ${utcTime}`);

        // Fetch trades that occurred on or before the specified timestamp
        const trades = await Trade.find({ utcTime: { $lte: utcTime.toISOString() } });

        console.log(`Fetched trades:`);
        console.log(trades); // Log trades fetched for debugging

        // Initialize an object to store balances
        const balances = {};

        // Process each trade to calculate balances
        trades.forEach(trade => {
            const { baseCoin, amount, operation } = trade;

            // Ensure baseCoin is initialized in balances
            if (!(baseCoin in balances)) {
                balances[baseCoin] = 0;
            }

            // Update balance based on operation (BUY or SELL)
            if (operation === 'Buy') { // Adjusted operation comparison
                balances[baseCoin] += amount;
            } else if (operation === 'Sell') { // Adjusted operation comparison
                balances[baseCoin] -= amount;
            }
        });

        console.log(`Calculated balances:`);
        console.log(balances); // Log calculated balances for debugging

        res.json(balances);
    } catch (err) {
        console.error('Error calculating balances:', err);
        res.status(500).send('Error calculating balances: ' + err.message);
    }
});

