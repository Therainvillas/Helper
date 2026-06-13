const express = require('express');
const cors = require('cors');
const path = require('path');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'database.db');

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Inisialisasi Database SQLite
let db;
async function initDB() {
  db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });

  // Buat tabel Tugas
  await db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      location TEXT,
      priority TEXT,
      status TEXT,
      assignedTo TEXT,
      photos TEXT, -- JSON Array of photos
      completionNote TEXT,
      createdAt TEXT,
      updatedAt TEXT,
      completedAt TEXT
    )
  `);

  // Buat tabel Devices (untuk push notification)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      token TEXT PRIMARY KEY,
      helperName TEXT,
      createdAt TEXT
    )
  `);

  console.log('Database SQLite initialized successfully.');
}

// Inisiasi database dan jalankan server
initDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VillaTask Backend running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
});

// ======================== API ROUTING ========================

// 1. GET ALL TASKS
app.get('/api/tasks', async (req, res) => {
  try {
    const action = req.query.action || 'getTasks';
    let query = 'SELECT * FROM tasks';
    
    if (action === 'getHistory') {
      query += " WHERE status = 'selesai'";
    } else if (action === 'getTasks') {
      query += " WHERE status != 'selesai'";
    }
    
    const rows = await db.all(query);
    
    // Parse photos JSON
    const tasks = rows.map(r => ({
      ...r,
      photos: JSON.parse(r.photos || '[]')
    }));
    
    res.json({ tasks });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// 2. MAIN POST ROUTE FOR SYNCING ACTIONS (GAS Fallback compatible)
app.post('/api/sync', async (req, res) => {
  const d = req.body;
  try {
    // CREATE TASK
    if (d.action === 'createTask') {
      const t = d.task;
      await db.run(
        `INSERT INTO tasks (id, title, description, location, priority, status, assignedTo, photos, completionNote, createdAt, updatedAt, completedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          t.id, t.title, t.description || '', t.location || '',
          t.priority, t.status || 'belum', t.assignedTo || '',
          JSON.stringify(t.photos || []), t.completionNote || '',
          t.createdAt, t.updatedAt, t.completedAt || ''
        ]
      );
      return res.json({ success: true });
    }

    // UPDATE STATUS ONLY
    if (d.action === 'updateTask') {
      const now = new Date().toISOString();
      const params = [d.status, now];
      let query = 'UPDATE tasks SET status = ?, updatedAt = ?';
      
      if (d.status === 'selesai') {
        query += ', completedAt = ?';
        params.push(now);
      }
      query += ' WHERE id = ?';
      params.push(d.id);
      
      const result = await db.run(query, params);
      if (result.changes === 0) {
        return res.status(404).json({ error: 'Task not found' });
      }
      return res.json({ success: true });
    }

    // UPDATE FULL TASK
    if (d.action === 'updateTaskFull') {
      const t = d.task;
      const result = await db.run(
        `UPDATE tasks 
         SET title = ?, description = ?, location = ?, priority = ?, status = ?, assignedTo = ?, photos = ?, completionNote = ?, updatedAt = ?, completedAt = ?
         WHERE id = ?`,
        [
          t.title, t.description || '', t.location || '', t.priority, t.status, t.assignedTo || '',
          JSON.stringify(t.photos || []), t.completionNote || '', t.updatedAt, t.completedAt || '',
          t.id
        ]
      );
      if (result.changes === 0) {
        return res.status(404).json({ error: 'Task not found' });
      }
      return res.json({ success: true });
    }

    // DELETE TASK
    if (d.action === 'deleteTask') {
      const result = await db.run('DELETE FROM tasks WHERE id = ?', [d.id]);
      if (result.changes === 0) {
        return res.status(404).json({ error: 'Task not found' });
      }
      return res.json({ success: true });
    }

    // CLEAN ALL TASKS
    if (d.action === 'cleanAllTasks') {
      await db.run('DELETE FROM tasks');
      return res.json({ success: true });
    }

    // REGISTER FCM DEVICE
    if (d.action === 'registerDevice') {
      const existing = await db.get('SELECT * FROM devices WHERE token = ?', [d.token]);
      if (existing) {
        if (d.helperName) {
          await db.run('UPDATE devices SET helperName = ? WHERE token = ?', [d.helperName, d.token]);
        }
        return res.json({ success: true, exists: true });
      }
      await db.run('INSERT INTO devices (token, helperName, createdAt) VALUES (?, ?, ?)', [
        d.token, d.helperName || '', new Date().toISOString()
      ]);
      return res.json({ success: true });
    }

    // fallback / push notification placeholder (bisa dilanjutkan dengan Firebase Admin SDK jika perlu)
    if (d.action === 'sendNotification') {
      console.log(`Push notification request: To ${d.helperName} -> ${d.taskTitle}`);
      return res.json({ success: true, info: 'Notification logged on backend' });
    }

    res.status(400).json({ error: 'Unknown action: ' + d.action });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});
