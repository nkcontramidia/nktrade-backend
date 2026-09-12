const express = require('express');
const router = express.Router();
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../database');
const { authenticateToken } = require('./auth');

const SIGILOPAY_BASE_URL = process.env.SIGILOPAY_BASE_URL || 'https://app.sigilopay.com.br';
const SIGILOPAY_PUBLIC_KEY = process.env.SIGILOPAY_PUBLIC_KEY;
const SIGILOPAY_SECRET_KEY = process.env.SIGILOPAY_SECRET_KEY;
const WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL || 'http://localhost:3000';

function sigiloHeaders() {
    return {
        'x-public-key': SIGILOPAY_PUBLIC_KEY,
        'x-secret-key': SIGILOPAY_SECRET_KEY,
        'Content-Type': 'application/json'
    };
}

router.post('/create', authenticateToken, async (req, res) => {
    const { amount } = req.body;
    const userId = req.user.id;

    if (!amount || amount < 10) return res.status(400).json({ error: 'Valor minimo: R$ 10,00' });
    if (amount > 100000) return res.status(400).json({ error: 'Valor maximo: R$ 100.000,00' });

    db.get('SELECT * FROM users WHERE id = ?', [userId], async (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'Usuario nao encontrado' });

        const identifier = 'NKT-' + Date.now() + '-' + uuidv4().slice(0, 8);

        try {
            const response = await axios.post(
                SIGILOPAY_BASE_URL + '/gateway/pix/receive',
                {
                    identifier: identifier,
                    amount: amount,
                    client: {
                        name: user.name,
                        email: user.email,
                        phone: '(11) 99999-9999',
                        document: '123.456.789-00'
                    },
                    callbackUrl: WEBHOOK_BASE_URL + '/webhook/sigilopay'
                },
                { headers: sigiloHeaders() }
            );

            const data = response.data;

            if (data.status !== 'OK' && data.status !== 'PENDING') {
                return res.status(400).json({ error: data.errorDescription || 'Erro ao criar cobranca PIX' });
            }

            const txId = uuidv4();
            db.run(
                'INSERT INTO pix_transactions (id, user_id, identifier, sigilopay_transaction_id, amount, status, webhook_token, pix_code, qr_code_base64) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    txId,
                    userId,
                    identifier,
                    data.transactionId,
                    amount,
                    'PENDING',
                    data.webhookToken,
                    data.pix && data.pix.code ? data.pix.code : null,
                    data.pix && data.pix.qrCodeBase64 ? data.pix.qrCodeBase64 : null
                ],
                function(err) {
                    if (err) return res.status(500).json({ error: 'Erro ao salvar transacao' });

                    db.run(
                        'INSERT INTO wallet_history (id, user_id, type, amount, status, description, reference_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [uuidv4(), userId, 'deposit', amount, 'PENDING', 'Deposito via PIX', txId]
                    );

                    res.json({
                        success: true,
                        transactionId: txId,
                        identifier: identifier,
                        amount: amount,
                        pixCode: data.pix && data.pix.code ? data.pix.code : null,
                        qrCodeBase64: data.pix && data.pix.qrCodeBase64 ? data.pix.qrCodeBase64 : null,
                        status: 'PENDING'
                    });
                }
            );

        } catch (error) {
            console.error('Erro SigiloPay:', error.response ? error.response.data : error.message);
            var errMsg = 'Erro ao gerar cobranca PIX';
            if (error.response && error.response.data && error.response.data.message) errMsg = error.response.data.message;
            if (error.response && error.response.data && error.response.data.errorDescription) errMsg = error.response.data.errorDescription;
            res.status(500).json({ error: errMsg });
        }
    });
});

router.get('/status/:transactionId', authenticateToken, (req, res) => {
    const { transactionId } = req.params;
    const userId = req.user.id;

    db.get(
        'SELECT * FROM pix_transactions WHERE id = ? AND user_id = ?',
        [transactionId, userId],
        (err, tx) => {
            if (err || !tx) return res.status(404).json({ error: 'Transacao nao encontrada' });
            res.json({
                success: true,
                transactionId: tx.id,
                amount: tx.amount,
                status: tx.status,
                pixCode: tx.pix_code,
                qrCodeBase64: tx.qr_code_base64,
                createdAt: tx.created_at,
                paidAt: tx.paid_at
            });
        }
    );
});

module.exports = { router };
