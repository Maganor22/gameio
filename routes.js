// routes.js
const path    = require('path');
const express = require('express');
const bcrypt  = require('bcrypt');

module.exports = function(db) {
  const router = express.Router();

  // — Guest —
  router.get('/guest', (req, res) => {
    if (req.session.user) return res.redirect(req.query.redirect || '/');
    res.sendFile(path.join(__dirname, 'public', 'guest.html'));
  });
  router.post('/guest', (req, res) => {
    const { username } = req.body;
    if (!username?.trim()) {
      return res.json({ success: false, message: 'Pseudo invité requis.' });
    }
    const guestName = `Invité-${username.trim()}`;
    req.session.user = { id: req.sessionID, username: guestName, guest: true };
    res.json({ success: true, username: guestName });
  });

  // — Login / Register / Logout / Me —
  router.get('/login', (req, res) => {
    if (req.session.user) return res.redirect(req.query.redirect || '/');
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
  });
  router.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (!username?.trim() || !password) {
      return res.json({ success: false, message: 'Champs requis.' });
    }
    db.get(`SELECT * FROM users WHERE username = ?`, [username.trim()], (err, row) => {
      if (err || !row || !bcrypt.compareSync(password, row.password)) {
        return res.json({ success: false, message: 'Identifiants invalides.' });
      }
      req.session.user = { id: row.id, username: row.username };
      res.json({ success: true });
    });
  });

  router.get('/register', (req, res) => {
    if (req.session.user) return res.redirect(req.query.redirect || '/');
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
  });
  router.post('/register', (req, res) => {
    const { username, password } = req.body;
    if (!username?.trim() || !password) {
      return res.json({ success: false, message: 'Champs requis.' });
    }
    const hash = bcrypt.hashSync(password, 10);
    db.run(
      `INSERT INTO users(username, password) VALUES(?, ?)`,
      [username.trim(), hash],
      function(err) {
        if (err) {
          return res.json({ success: false, message: 'Nom déjà utilisé.' });
        }
        req.session.user = { id: this.lastID, username: username.trim() };
        res.json({ success: true });
      }
    );
  });

  router.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
  });

  router.get('/api/me', (req, res) => {
    if (!req.session.user) return res.status(401).json({});
    res.json({ username: req.session.user.username });
  });

  // — Page principale protégée —
  router.get('/', (req, res) => {
    if (!req.session.user) {
      return res.redirect(`/login?redirect=${encodeURIComponent(req.originalUrl)}`);
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  return router;
};
