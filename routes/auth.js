const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../database');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token nao fornecido' });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Token invalido' });
        req.user = user;
        next();
    });
}

router.post('/register', async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || name.length < 2) return res.status(400).json({ error: 'Nome invalido' });
    if (!email || !email.includes('@')) return res.status(400).json({ error: 'E-mail invalido' });
    if (!password || password.length < 8) return res.status(400).json({ error: 'Senha deve ter no minimo 8 caracteres' });

    try {
        const passwordHash = await bcrypt.hash(password, 10);
        const userId = uuidv4();
        const emailNorm = email.trim().toLowerCase();

        db.run(
            'INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)',
            [userId, name.trim(), emailNorm, passwordHash],
            function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE')) {
                        return res.status(400).json({ error: 'E-mail ja cadastrado' });
                    }
                    return res.status(500).json({ error: 'Erro ao criar conta' });
                }
                const token = jwt.sign({ id: userId, email: emailNorm }, JWT_SECRET, { expiresIn: '7d' });
                res.json({
                    success: true,
                    token,
                    user: { id: userId, name: name.trim(), email: emailNorm, balance: 0 }
                });
            }
        );
    } catch (error) {
        res.status(500).json({ error: 'Erro interno' });
    }
});

router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'E-mail e senha obrigatorios' });

    const emailNorm = email.trim().toLowerCase();

    db.get('SELECT * FROM users WHERE email = ?', [emailNorm], async (err, user) => {
        if (err || !user) return res.status(401).json({ error: 'E-mail ou senha incorretos' });

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return res.status(401).json({ error: 'E-mail ou senha incorretos' });

        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                balance: user.balance,
                pendingBalance: user.pending_balance,
                totalInvested: user.total_invested
            }
        });
    });
});

router.get('/me', authenticateToken, (req, res) => {
    db.get('SELECT * FROM users WHERE id = ?', [req.user.id], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'Usuario nao encontrado' });
        res.json({
            success: true,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                balance: user.balance,
                pendingBalance: user.pending_balance,
                totalInvested: user.total_invested
            }
        });
    });
});

module.exports = { router, authenticateToken };
