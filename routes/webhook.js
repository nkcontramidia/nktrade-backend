const express = require('express');
const router = express.Router();
const { db } = require('../database');

router.post('/sigilopay', (req, res) => {
    const payload = req.body;
    console.log('Webhook recebido:', JSON.stringify(payload, null, 2));

    const { event, token, transaction } = payload;

    if (!transaction || !transaction.identifier) {
        return res.status(400).send('Invalid payload');
    }

    const identifier = transaction.identifier;

    db.get('SELECT * FROM pix_transactions WHERE identifier = ?', [identifier], (err, tx) => {
        if (err || !tx) return res.status(404).send('Transaction not found');

        if (tx.webhook_token && token !== tx.webhook_token) {
            return res.status(401).send('Invalid webhook token');
        }

        if (tx.status === 'COMPLETED') {
            return res.status(200).send('Already processed');
        }

        if (event === 'TRANSACTION_PAID') {
            const paidAmount = transaction.amount || transaction.totalAmount;
            if (Math.abs(paidAmount - tx.amount) > 0.01) {
                return res.status(400).send('Amount mismatch');
            }

            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                db.run(`UPDATE pix_transactions SET status = 'COMPLETED', paid_at = CURRENT_TIMESTAMP WHERE id = ?`, [tx.id]);
                db.run(`UPDATE users SET balance = balance + ?, total_invested = total_invested + ? WHERE id = ?`, [tx.amount, tx.amount, tx.user_id]);
                db.run(`UPDATE wallet_history SET status = 'COMPLETED', description = ? WHERE reference_id = ?`, ['Deposito confirmado via PIX', tx.id]);
                db.run('COMMIT', (commitErr) => {
                    if (commitErr) {
                        db.run('ROLLBACK');
                        return res.status(500).send('Database error');
                    }
                    console.log('Pagamento confirmado:', identifier, 'R$', tx.amount);
                    res.status(200).send('OK');
                });
            });

        } else if (event === 'TRANSACTION_CANCELED') {
            db.run(`UPDATE pix_transactions SET status = 'CANCELED' WHERE id = ?`, [tx.id]);
            db.run(`UPDATE wallet_history SET status = 'CANCELED' WHERE reference_id = ?`, [tx.id]);
            res.status(200).send('OK');
        } else if (event === 'TRANSACTION_REFUNDED') {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                db.run(`UPDATE pix_transactions SET status = 'REFUNDED' WHERE id = ?`, [tx.id]);
                db.run(`UPDATE users SET balance = balance - ? WHERE id = ? AND balance >= ?`, [tx.amount, tx.user_id, tx.amount]);
                db.run(`UPDATE wallet_history SET status = 'REFUNDED' WHERE reference_id = ?`, [tx.id]);
                db.run('COMMIT', () => res.status(200).send('OK'));
            });
        } else {
            res.status(200).send('OK');
        }
    });
});

module.exports = { router };
