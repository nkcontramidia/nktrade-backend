require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDatabase } = require('./database');
const authRoutes = require('./routes/auth');
const pixRoutes = require('./routes/pix');
const webhookRoutes = require('./routes/webhook');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/api/auth', authRoutes.router);
app.use('/api/pix', pixRoutes.router);
app.use('/webhook', webhookRoutes.router);

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

initDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`NkTrade Backend rodando na porta ${PORT}`);
    });
}).catch(err => {
    console.error('Erro ao inicializar banco:', err);
    process.exit(1);
});