const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = 'your-secret-key-change-in-production';

app.use(cors({
  origin: ['http://localhost:3000', 'https://resplendent-begonia-c4fef3.netlify.app/'], // Replace with production domain
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json());
app.options('*', cors());

// Email configuration (SMTP2GO) - FIXED: createTransport instead of createTransporter
const emailTransporter = nodemailer.createTransport({
  host: 'mail.smtp2go.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP2GO_USERNAME || 'sjcem.edu.in',
    pass: process.env.SMTP2GO_PASSWORD || '5d23YToO7KI0kmC1'
  }
});

// Database connection
const dbConfig = {
  host: '103.120.179.212',
  user: 'sources',
  password: 'Sources@123',
  database: 'devlope4_users'
};

let db;

async function initDatabase() {
  try {
    // Create connection without database first
    const connection = await mysql.createConnection({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password
    });

    // Create database if it doesn't exist
    await connection.execute('CREATE DATABASE IF NOT EXISTS neurodesk');
    await connection.end();

    // Connect to the database
    db = await mysql.createConnection(dbConfig);
    console.log('Connected to MySQL database');

    // Create tables
    await createTables();
  } catch (error) {
    console.error('Database connection failed:', error);
  }
}

async function createTables() {
  try {
    // Users table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        full_name VARCHAR(255) NOT NULL,
        username VARCHAR(100) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        phone VARCHAR(20),
        address TEXT,
        profile_photo VARCHAR(500),
        role ENUM('ADMIN', 'TEAM_LEADER', 'EMPLOYEE') DEFAULT 'EMPLOYEE',
        team_id INT,
        skills JSON,
        subscription_status ENUM('FREE', 'PREMIUM', 'ENTERPRISE') DEFAULT 'FREE',
        subscription_expires_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Teams table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS teams (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        leader_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (leader_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // Tasks table with payment_amount and is_paid columns
    await db.execute(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        assigned_to INT NULL,
        assigned_by INT NOT NULL,
        team_id INT NULL,
        priority ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') DEFAULT 'MEDIUM',
        status ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED') DEFAULT 'PENDING',
        required_skills JSON,
        due_date DATETIME NULL,
        payment_amount DECIMAL(10,2) DEFAULT 0.00,
        is_paid BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL
      )
    `);

    // Notifications table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT,
        type ENUM('TASK', 'TEAM', 'SYSTEM', 'ANNOUNCEMENT', 'PAYMENT') DEFAULT 'SYSTEM',
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Messages table for communication
    await db.execute(`
      CREATE TABLE IF NOT EXISTS messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sender_id INT NOT NULL,
        receiver_id INT NULL,
        team_id INT NULL,
        message TEXT NOT NULL,
        message_type ENUM('DIRECT', 'TEAM', 'ANNOUNCEMENT') DEFAULT 'DIRECT',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL
      )
    `);

    // Payments table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        task_id INT NOT NULL,
        user_id INT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        status ENUM('PENDING', 'COMPLETED', 'FAILED') DEFAULT 'PENDING',
        payment_method VARCHAR(100),
        transaction_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Invitations table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS invitations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        role ENUM('ADMIN', 'TEAM_LEADER', 'EMPLOYEE') DEFAULT 'EMPLOYEE',
        invited_by INT NOT NULL,
        token VARCHAR(255) UNIQUE NOT NULL,
        status ENUM('PENDING', 'ACCEPTED', 'EXPIRED') DEFAULT 'PENDING',
        expires_at DATETIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    console.log('Database tables created successfully');

    // Check if payment_amount column exists, if not add it
    try {
      await db.execute('ALTER TABLE tasks ADD COLUMN payment_amount DECIMAL(10,2) DEFAULT 0.00');
      console.log('Added payment_amount column to tasks table');
    } catch (error) {
      if (error.code !== 'ER_DUP_FIELDNAME') {
        console.log('payment_amount column already exists or error:', error.message);
      }
    }

    // Check if is_paid column exists, if not add it
    try {
      await db.execute('ALTER TABLE tasks ADD COLUMN is_paid BOOLEAN DEFAULT FALSE');
      console.log('Added is_paid column to tasks table');
    } catch (error) {
      if (error.code !== 'ER_DUP_FIELDNAME') {
        console.log('is_paid column already exists or error:', error.message);
      }
    }

    // Check if subscription_status column exists, if not add it
    try {
      await db.execute('ALTER TABLE users ADD COLUMN subscription_status ENUM("FREE", "PREMIUM", "ENTERPRISE") DEFAULT "FREE"');
      console.log('Added subscription_status column to users table');
    } catch (error) {
      if (error.code !== 'ER_DUP_FIELDNAME') {
        console.log('subscription_status column already exists or error:', error.message);
      }
    }

    // Check if subscription_expires_at column exists, if not add it
    try {
      await db.execute('ALTER TABLE users ADD COLUMN subscription_expires_at DATETIME NULL');
      console.log('Added subscription_expires_at column to users table');
    } catch (error) {
      if (error.code !== 'ER_DUP_FIELDNAME') {
        console.log('subscription_expires_at column already exists or error:', error.message);
      }
    }

  } catch (error) {
    console.error('Error creating tables:', error);
  }
}

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.sendStatus(401);
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Helper function to safely handle null values
const safeValue = (value) => {
  return value === undefined || value === '' ? null : value;
};

// Routes

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { full_name, username, email, password, phone, address, profile_photo, skills, role } = req.body;
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const [result] = await db.execute(
      'INSERT INTO users (full_name, username, email, password, phone, address, profile_photo, skills, role) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        full_name, 
        username, 
        email, 
        hashedPassword, 
        safeValue(phone), 
        safeValue(address), 
        safeValue(profile_photo), 
        JSON.stringify(skills || []), 
        role || 'EMPLOYEE'
      ]
    );

    res.status(201).json({ message: 'User registered successfully', userId: result.insertId });
  } catch (error) {
    console.error('Registration error:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'Username or email already exists' });
    } else {
      res.status(500).json({ error: 'Registration failed' });
    }
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const [users] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
    
    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = users[0];
    const validPassword = await bcrypt.compare(password, user.password);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        username: user.username,
        email: user.email,
        role: user.role,
        team_id: user.team_id,
        skills: JSON.parse(user.skills || '[]'),
        profile_photo: user.profile_photo,
        phone: user.phone,
        address: user.address,
        subscription_status: user.subscription_status,
        created_at: user.created_at
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get all users
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const [users] = await db.execute(
      'SELECT id, full_name, username, email, role, team_id, skills, profile_photo, phone, created_at FROM users'
    );
    
    res.json(users.map(user => ({
      ...user,
      skills: JSON.parse(user.skills || '[]')
    })));
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Create task
app.post('/api/tasks', authenticateToken, async (req, res) => {
  try {
    const { title, description, priority, required_skills, due_date, team_id, assigned_to, payment_amount } = req.body;
    
    // Auto-assign based on skills if no specific assignee and required skills exist
    let finalAssignedTo = assigned_to;
    
    if (!assigned_to && required_skills && required_skills.length > 0) {
      // Find best matching employee
      const [users] = await db.execute(
        'SELECT id, skills FROM users WHERE role = "EMPLOYEE" AND (team_id = ? OR ? IS NULL)',
        [safeValue(team_id), safeValue(team_id)]
      );
      
      let bestMatch = null;
      let bestScore = 0;
      
      users.forEach(user => {
        const userSkills = JSON.parse(user.skills || '[]');
        const matchCount = required_skills.filter(skill => 
          userSkills.some(userSkill => userSkill.toLowerCase().includes(skill.toLowerCase()))
        ).length;
        
        const score = matchCount / required_skills.length;
        if (score > bestScore) {
          bestScore = score;
          bestMatch = user.id;
        }
      });
      
      finalAssignedTo = bestMatch;
    }

    const [result] = await db.execute(
      'INSERT INTO tasks (title, description, assigned_to, assigned_by, team_id, priority, required_skills, due_date, payment_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        title, 
        safeValue(description), 
        finalAssignedTo, 
        req.user.userId, 
        safeValue(team_id), 
        priority || 'MEDIUM', 
        JSON.stringify(required_skills || []), 
        safeValue(due_date),
        safeValue(payment_amount) || 0.00
      ]
    );

    // Create notification for assigned user
    if (finalAssignedTo) {
      await db.execute(
        'INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
        [finalAssignedTo, 'New Task Assigned', `You have been assigned a new task: ${title}`, 'TASK']
      );
    }

    res.status(201).json({ 
      message: 'Task created successfully', 
      taskId: result.insertId, 
      assigned_to: finalAssignedTo 
    });
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Get tasks
app.get('/api/tasks', authenticateToken, async (req, res) => {
  try {
    let query = `
      SELECT t.*, 
             u1.full_name as assigned_to_name,
             u2.full_name as assigned_by_name
      FROM tasks t
      LEFT JOIN users u1 ON t.assigned_to = u1.id
      LEFT JOIN users u2 ON t.assigned_by = u2.id
    `;
    let params = [];

    if (req.user.role === 'EMPLOYEE') {
      query += ' WHERE t.assigned_to = ?';
      params.push(req.user.userId);
    } else if (req.user.role === 'TEAM_LEADER') {
      query += ' WHERE t.assigned_by = ?';
      params.push(req.user.userId);
    }

    query += ' ORDER BY t.created_at DESC';

    const [tasks] = await db.execute(query, params);
    
    res.json(tasks.map(task => ({
      ...task,
      required_skills: JSON.parse(task.required_skills || '[]')
    })));
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// Update task
app.put('/api/tasks/:id', authenticateToken, async (req, res) => {
  try {
    const { title, description, priority, required_skills, due_date, assigned_to, payment_amount, status } = req.body;
    const taskId = req.params.id;

    await db.execute(
      'UPDATE tasks SET title = ?, description = ?, priority = ?, required_skills = ?, due_date = ?, assigned_to = ?, payment_amount = ?, status = ? WHERE id = ?',
      [
        title,
        safeValue(description),
        priority,
        JSON.stringify(required_skills || []),
        safeValue(due_date),
        safeValue(assigned_to),
        safeValue(payment_amount) || 0.00,
        status || 'PENDING',
        taskId
      ]
    );

    res.json({ message: 'Task updated successfully' });
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// Update task status
app.put('/api/tasks/:id/status', authenticateToken, async (req, res) => {
  try {
    const { status } = req.body;
    const taskId = req.params.id;

    // Get task details for payment processing
    const [tasks] = await db.execute('SELECT * FROM tasks WHERE id = ?', [taskId]);
    const task = tasks[0];

    await db.execute(
      'UPDATE tasks SET status = ? WHERE id = ?',
      [status, taskId]
    );

    // If task is completed and has payment amount, create payment record
    if (status === 'COMPLETED' && task && task.payment_amount > 0 && task.assigned_to) {
      await db.execute(
        'INSERT INTO payments (task_id, user_id, amount, status) VALUES (?, ?, ?, ?)',
        [taskId, task.assigned_to, task.payment_amount, 'COMPLETED']
      );

      // Create payment notification
      await db.execute(
        'INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
        [task.assigned_to, 'Payment Received', `You received $${task.payment_amount} for completing "${task.title}"`, 'PAYMENT']
      );

      // Mark task as paid
      await db.execute('UPDATE tasks SET is_paid = TRUE WHERE id = ?', [taskId]);
    }

    res.json({ message: 'Task status updated successfully' });
  } catch (error) {
    console.error('Error updating task status:', error);
    res.status(500).json({ error: 'Failed to update task status' });
  }
});

// Assign task to user
app.put('/api/tasks/:id/assign', authenticateToken, async (req, res) => {
  try {
    const { assigned_to } = req.body;
    const taskId = req.params.id;

    await db.execute(
      'UPDATE tasks SET assigned_to = ? WHERE id = ?',
      [assigned_to, taskId]
    );

    // Create notification for assigned user
    if (assigned_to) {
      const [tasks] = await db.execute('SELECT title FROM tasks WHERE id = ?', [taskId]);
      const task = tasks[0];
      
      await db.execute(
        'INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
        [assigned_to, 'Task Assigned', `You have been assigned to task: ${task.title}`, 'TASK']
      );
    }

    res.json({ message: 'Task assigned successfully' });
  } catch (error) {
    console.error('Error assigning task:', error);
    res.status(500).json({ error: 'Failed to assign task' });
  }
});

// Delete task
app.delete('/api/tasks/:id', authenticateToken, async (req, res) => {
  try {
    const taskId = req.params.id;

    await db.execute('DELETE FROM tasks WHERE id = ?', [taskId]);

    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// Send invitation
app.post('/api/invite', authenticateToken, async (req, res) => {
  try {
    const { email, role } = req.body;
    const token = jwt.sign({ email, role }, JWT_SECRET, { expiresIn: '7d' });
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Save invitation to database
    await db.execute(
      'INSERT INTO invitations (email, role, invited_by, token, expires_at) VALUES (?, ?, ?, ?, ?)',
      [email, role, req.user.userId, token, expiresAt]
    );

    // Send email invitation
    const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/register?token=${token}`;
    
    const mailOptions = {
      from: process.env.FROM_EMAIL || 'noreply@neurodesk.com',
      to: email,
      subject: 'You\'re invited to join NeuroDesk!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #3B82F6;">Welcome to NeuroDesk!</h2>
          <p>You've been invited to join our AI-powered task management platform.</p>
          <p>Click the button below to accept your invitation and create your account:</p>
          <a href="${inviteLink}" style="display: inline-block; background-color: #3B82F6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0;">Accept Invitation</a>
          <p>This invitation will expire in 7 days.</p>
          <p>If you have any questions, please contact our support team.</p>
          <hr style="margin: 30px 0;">
          <p style="color: #666; font-size: 12px;">Powered by Bolt • NeuroDesk Team</p>
        </div>
      `
    };

    await emailTransporter.sendMail(mailOptions);

    res.json({ message: 'Invitation sent successfully' });
  } catch (error) {
    console.error('Error sending invitation:', error);
    res.status(500).json({ error: 'Failed to send invitation' });
  }
});

// Send email
app.post('/api/send-email', authenticateToken, async (req, res) => {
  try {
    const { to, subject, message, type } = req.body;

    const mailOptions = {
      from: process.env.FROM_EMAIL || 'noreply@neurodesk.com',
      to: to,
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #3B82F6;">NeuroDesk Notification</h2>
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            ${message}
          </div>
          <hr style="margin: 30px 0;">
          <p style="color: #666; font-size: 12px;">Powered by Bolt • NeuroDesk Team</p>
        </div>
      `
    };

    await emailTransporter.sendMail(mailOptions);

    res.json({ message: 'Email sent successfully' });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

// Get notifications
app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const [notifications] = await db.execute(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      [req.user.userId]
    );
    
    res.json(notifications);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Mark notification as read
app.put('/api/notifications/:id/read', authenticateToken, async (req, res) => {
  try {
    await db.execute(
      'UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.userId]
    );
    
    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Error updating notification:', error);
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

// Send message
app.post('/api/messages', authenticateToken, async (req, res) => {
  try {
    const { message, message_type, receiver_id, team_id } = req.body;
    
    const [result] = await db.execute(
      'INSERT INTO messages (sender_id, receiver_id, team_id, message, message_type) VALUES (?, ?, ?, ?, ?)',
      [req.user.userId, safeValue(receiver_id), safeValue(team_id), message, message_type]
    );

    // Create notifications for message recipients
    if (message_type === 'TEAM' || message_type === 'ANNOUNCEMENT') {
      // Get all users except sender for team messages
      const [users] = await db.execute('SELECT id FROM users WHERE id != ?', [req.user.userId]);
      
      for (const user of users) {
        await db.execute(
          'INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
          [user.id, `New ${message_type.toLowerCase()} message`, message.substring(0, 100), 'TEAM']
        );
      }
    } else if (message_type === 'DIRECT' && receiver_id) {
      // Create notification for direct message recipient
      await db.execute(
        'INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
        [receiver_id, 'New direct message', message.substring(0, 100), 'TEAM']
      );
    }

    res.status(201).json({ message: 'Message sent successfully', messageId: result.insertId });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Get messages
app.get('/api/messages', authenticateToken, async (req, res) => {
  try {
    const [messages] = await db.execute(`
      SELECT m.*, u.full_name as sender_name
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.message_type IN ('TEAM', 'ANNOUNCEMENT') 
         OR m.sender_id = ? 
         OR m.receiver_id = ?
      ORDER BY m.created_at DESC
      LIMIT 100
    `, [req.user.userId, req.user.userId]);
    
    res.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Get reports data
app.get('/api/reports', authenticateToken, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const dateFilter = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Tasks by status
    const [tasksByStatus] = await db.execute(`
      SELECT status, COUNT(*) as count 
      FROM tasks 
      WHERE created_at >= ? 
      GROUP BY status
    `, [dateFilter]);

    // Tasks by priority
    const [tasksByPriority] = await db.execute(`
      SELECT priority, COUNT(*) as count 
      FROM tasks 
      WHERE created_at >= ? 
      GROUP BY priority
    `, [dateFilter]);

    // User productivity
    const [userProductivity] = await db.execute(`
      SELECT u.full_name, 
             COUNT(CASE WHEN t.status = 'COMPLETED' THEN 1 END) as completed,
             COUNT(CASE WHEN t.status IN ('PENDING', 'IN_PROGRESS') THEN 1 END) as pending
      FROM users u
      LEFT JOIN tasks t ON u.id = t.assigned_to AND t.created_at >= ?
      WHERE u.role = 'EMPLOYEE'
      GROUP BY u.id, u.full_name
    `, [dateFilter]);

    // Monthly progress (last 6 months)
    const [monthlyProgress] = await db.execute(`
      SELECT 
        DATE_FORMAT(created_at, '%b') as month,
        COUNT(*) as created,
        COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed
      FROM tasks 
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
      GROUP BY YEAR(created_at), MONTH(created_at)
      ORDER BY created_at
    `);

    // Team performance
    const [teamPerformance] = await db.execute(`
      SELECT 
        'Development' as team,
        COUNT(DISTINCT u.id) as members,
        COUNT(t.id) as tasksCompleted,
        AVG(DATEDIFF(t.updated_at, t.created_at)) as avgTime
      FROM users u
      LEFT JOIN tasks t ON u.id = t.assigned_to AND t.status = 'COMPLETED'
      WHERE u.role = 'EMPLOYEE'
      UNION ALL
      SELECT 
        'Design' as team,
        COUNT(DISTINCT u.id) as members,
        COUNT(t.id) as tasksCompleted,
        AVG(DATEDIFF(t.updated_at, t.created_at)) as avgTime
      FROM users u
      LEFT JOIN tasks t ON u.id = t.assigned_to AND t.status = 'COMPLETED'
      WHERE u.role = 'EMPLOYEE'
    `);

    // Payment stats
    const [paymentStats] = await db.execute(`
      SELECT 
        SUM(CASE WHEN status = 'COMPLETED' THEN amount ELSE 0 END) as totalPaid,
        SUM(CASE WHEN status = 'PENDING' THEN amount ELSE 0 END) as pendingPayments,
        AVG(amount) as avgTaskValue
      FROM payments
      WHERE created_at >= ?
    `, [dateFilter]);

    // Top earners
    const [topEarners] = await db.execute(`
      SELECT u.full_name as name, SUM(p.amount) as amount
      FROM payments p
      JOIN users u ON p.user_id = u.id
      WHERE p.status = 'COMPLETED' AND p.created_at >= ?
      GROUP BY u.id, u.full_name
      ORDER BY amount DESC
      LIMIT 3
    `, [dateFilter]);

    res.json({
      tasksByStatus: tasksByStatus.map(item => ({
        name: item.status.replace('_', ' '),
        value: item.count,
        color: getStatusColor(item.status)
      })),
      tasksByPriority: tasksByPriority.map(item => ({
        name: item.priority,
        value: item.count,
        color: getPriorityColor(item.priority)
      })),
      userProductivity: userProductivity.map(user => ({
        name: user.full_name,
        completed: user.completed,
        pending: user.pending,
        efficiency: user.completed + user.pending > 0 ? Math.round((user.completed / (user.completed + user.pending)) * 100) : 0
      })),
      monthlyProgress: monthlyProgress,
      teamPerformance: teamPerformance.map(team => ({
        team: team.team,
        members: team.members,
        tasksCompleted: team.tasksCompleted,
        avgTime: Math.round(team.avgTime * 10) / 10 || 0
      })),
      paymentStats: {
        totalPaid: paymentStats[0]?.totalPaid || 0,
        pendingPayments: paymentStats[0]?.pendingPayments || 0,
        avgTaskValue: paymentStats[0]?.avgTaskValue || 0,
        topEarners: topEarners
      }
    });
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// Helper functions for colors
function getStatusColor(status) {
  switch (status) {
    case 'COMPLETED': return '#10B981';
    case 'IN_PROGRESS': return '#3B82F6';
    case 'PENDING': return '#F59E0B';
    case 'CANCELLED': return '#EF4444';
    default: return '#6B7280';
  }
}

function getPriorityColor(priority) {
  switch (priority) {
    case 'URGENT': return '#EF4444';
    case 'HIGH': return '#F59E0B';
    case 'MEDIUM': return '#3B82F6';
    case 'LOW': return '#10B981';
    default: return '#6B7280';
  }
}

// Dashboard stats
app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
  try {
    let stats = {};

    if (req.user.role === 'ADMIN') {
      const [userCount] = await db.execute('SELECT COUNT(*) as count FROM users');
      const [taskCount] = await db.execute('SELECT COUNT(*) as count FROM tasks');
      const [teamCount] = await db.execute('SELECT COUNT(DISTINCT team_id) as count FROM users WHERE team_id IS NOT NULL');
      const [pendingTasks] = await db.execute('SELECT COUNT(*) as count FROM tasks WHERE status = "PENDING"');

      stats = {
        totalUsers: userCount[0].count,
        totalTasks: taskCount[0].count,
        totalTeams: teamCount[0].count,
        pendingTasks: pendingTasks[0].count
      };
    } else if (req.user.role === 'TEAM_LEADER') {
      const [teamTasks] = await db.execute(
        'SELECT COUNT(*) as count FROM tasks WHERE assigned_by = ?',
        [req.user.userId]
      );
      const [completedTasks] = await db.execute(
        'SELECT COUNT(*) as count FROM tasks WHERE assigned_by = ? AND status = "COMPLETED"',
        [req.user.userId]
      );

      stats = {
        teamTasks: teamTasks[0].count,
        completedTasks: completedTasks[0].count
      };
    } else {
      const [myTasks] = await db.execute('SELECT COUNT(*) as count FROM tasks WHERE assigned_to = ?', [req.user.userId]);
      const [completedTasks] = await db.execute(
        'SELECT COUNT(*) as count FROM tasks WHERE assigned_to = ? AND status = "COMPLETED"',
        [req.user.userId]
      );

      stats = {
        myTasks: myTasks[0].count,
        completedTasks: completedTasks[0].count
      };
    }

    res.json(stats);
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

// Update user profile
app.put('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const { full_name, username, email, phone, address, profile_photo, skills } = req.body;
    
    await db.execute(
      'UPDATE users SET full_name = ?, username = ?, email = ?, phone = ?, address = ?, profile_photo = ?, skills = ? WHERE id = ?',
      [
        full_name, 
        username, 
        email, 
        safeValue(phone), 
        safeValue(address), 
        safeValue(profile_photo), 
        JSON.stringify(skills || []), 
        req.user.userId
      ]
    );

    res.json({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Get user stats
app.get('/api/user/stats', authenticateToken, async (req, res) => {
  try {
    const [completedTasks] = await db.execute(
      'SELECT COUNT(*) as count FROM tasks WHERE assigned_to = ? AND status = "COMPLETED"',
      [req.user.userId]
    );
    const [activeTasks] = await db.execute(
      'SELECT COUNT(*) as count FROM tasks WHERE assigned_to = ? AND status IN ("PENDING", "IN_PROGRESS")',
      [req.user.userId]
    );
    const [totalEarnings] = await db.execute(
      'SELECT SUM(amount) as total FROM payments WHERE user_id = ? AND status = "COMPLETED"',
      [req.user.userId]
    );

    res.json({
      completedTasks: completedTasks[0].count,
      activeTasks: activeTasks[0].count,
      totalEarnings: totalEarnings[0].total || 0
    });
  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({ error: 'Failed to fetch user stats' });
  }
});

// Get payments
app.get('/api/payments', authenticateToken, async (req, res) => {
  try {
    const [payments] = await db.execute(`
      SELECT p.*, t.title as task_title
      FROM payments p
      JOIN tasks t ON p.task_id = t.id
      WHERE p.user_id = ?
      ORDER BY p.created_at DESC
    `, [req.user.userId]);
    
    res.json(payments);
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

// Initialize database and start server
initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
