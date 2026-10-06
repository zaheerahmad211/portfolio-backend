/*=====================================================
   SERVER ENTRY POINT
=====================================================*/

const express   = require('express');
const mongoose  = require('mongoose');
const cors      = require('cors');
const dotenv    = require('dotenv');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const multer    = require('multer');

// Load models (Project, Certification, …) and auth middleware
const {
  Admin,
  Project,
  Certification,
  Achievement,
  Experience,
  Skill,
  Service,
  Message,
  Setting,
  Education
} = require('./models');
const { authMiddleware } = require('./auth');

dotenv.config();

const app = express();

/*=====================================================
   CORS – manual, bulletproof implementation
=====================================================*/
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://portfolio-frontend-one-woad-13.vercel.app',
  process.env.CLIENT_URL
].filter(Boolean);

const uniqueOrigins = [...new Set(allowedOrigins)];
console.log('Allowed CORS Origins:', uniqueOrigins);

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && uniqueOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  next();
});

/*=====================================================
   BODY PARSER  (increased limit for base64 images)
=====================================================*/
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

/*=====================================================
   FILE UPLOAD – Base64 stored in MongoDB
   ✅ No external service needed
   ✅ Works on Vercel (no filesystem)
   ✅ Images saved permanently in your existing DB
   ⚠  Keep images under 2 MB for best performance
=====================================================*/

// Store file in memory (never touches the filesystem)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB hard limit
});

// Upload endpoint – converts file to base64 data-URL and returns it
app.post('/api/upload', authMiddleware, upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const base64 = req.file.buffer.toString('base64');
    const dataUrl = `data:${req.file.mimetype};base64,${base64}`;

    return res.json({ url: dataUrl });
  } catch (error) {
    console.error('File upload error:', error);
    return res.status(500).json({ message: 'File upload failed' });
  }
});

/*=====================================================
   DATABASE CONNECTION
=====================================================*/
let dbPromise = null;
const connectDB = async () => {
  if (mongoose.connection.readyState === 1) return;
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not defined');

  await mongoose.connect(process.env.MONGO_URI);
  console.log('MongoDB connected');

  /*=================== DEFAULT ADMIN ===================*/
  const adminCount = await Admin.countDocuments();
  if (adminCount === 0) {
    const password = process.env.ADMIN_PASSWORD || 'admin123';
    const hashedPassword = await bcrypt.hash(password, 10);
    await Admin.create({
      email: process.env.ADMIN_EMAIL || 'admin@example.com',
      password: hashedPassword
    });
    console.log('Default admin created');
  }

  /*=================== INITIAL SETTINGS =================*/
  const settingCount = await Setting.countDocuments();
  if (settingCount === 0) {
    await Setting.create({
      name: 'Zaheer Ahmed',
      title: 'Website Developer / MERN Stack Developer',
      bio: 'Professional MERN Stack Developer crafting modern and responsive digital experiences.',
      email: 'zaheer@example.com',
      location: 'Pakistan',
      github: 'https://github.com',
      linkedin: 'https://linkedin.com'
    });
    console.log('Initial settings created');
  }
};

/*=====================================================
   DATABASE MIDDLEWARE
=====================================================*/
app.use(async (req, res, next) => {
  try {
    if (!dbPromise) {
      dbPromise = connectDB().catch(err => {
        dbPromise = null;
        throw err;
      });
    }
    await dbPromise;
    next();
  } catch (error) {
    console.error('Database connection error:', error);
    return res.status(500).json({
      message: 'Database connection failed',
      error: process.env.NODE_ENV !== 'production' ? error.message : undefined
    });
  }
});

/*=====================================================
   HEALTH CHECKS
=====================================================*/
app.get('/', (req, res) => res.json({ message: 'Portfolio Backend is running', status: 'success' }));
app.get('/api/health', (req, res) => res.json({ status: 'OK', message: 'Backend is healthy' }));

/*=====================================================
   AUTH – LOGIN
=====================================================*/
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const admin = await Admin.findOne({ email });
    if (!admin) return res.status(400).json({ message: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

    const token = jwt.sign(
      { id: admin._id },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: process.env.JWT_EXPIRE || '1d' }
    );

    return res.json({ token, admin: { id: admin._id, email: admin.email } });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Login failed' });
  }
});

/*=====================================================
   GENERIC CRUD ROUTES
=====================================================*/
const createCrudRoutes = (Model, routePath) => {
  app.get(`/api/${routePath}`, async (req, res) => {
    try {
      const items = await Model.find().sort({ createdAt: -1 });
      return res.json(items);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post(`/api/${routePath}`, authMiddleware, async (req, res) => {
    try {
      const savedItem = await new Model(req.body).save();
      return res.status(201).json(savedItem);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.put(`/api/${routePath}/:id`, authMiddleware, async (req, res) => {
    try {
      const updated = await Model.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
      );
      if (!updated) return res.status(404).json({ message: 'Item not found' });
      return res.json(updated);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.delete(`/api/${routePath}/:id`, authMiddleware, async (req, res) => {
    try {
      const deleted = await Model.findByIdAndDelete(req.params.id);
      if (!deleted) return res.status(404).json({ message: 'Item not found' });
      return res.json({ message: 'Deleted successfully' });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
};

createCrudRoutes(Project,       'projects');
createCrudRoutes(Certification, 'certifications');
createCrudRoutes(Achievement,   'achievements');
createCrudRoutes(Experience,    'experience');
createCrudRoutes(Skill,         'skills');
createCrudRoutes(Service,       'services');
createCrudRoutes(Education,     'education');

/*=====================================================
   MESSAGES
=====================================================*/
app.post('/api/messages', async (req, res) => {
  try {
    const newMessage = new Message(req.body);
    await newMessage.save();
    return res.status(201).json({ message: 'Message sent successfully' });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

app.get('/api/messages', authMiddleware, async (req, res) => {
  try {
    const msgs = await Message.find().sort({ createdAt: -1 });
    return res.json(msgs);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.delete('/api/messages/:id', authMiddleware, async (req, res) => {
  try {
    const del = await Message.findByIdAndDelete(req.params.id);
    if (!del) return res.status(404).json({ message: 'Message not found' });
    return res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

/*=====================================================
   SETTINGS
=====================================================*/
app.get('/api/settings', async (req, res) => {
  try {
    const setting = await Setting.findOne();
    return res.json(setting || {});
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.put('/api/settings', authMiddleware, async (req, res) => {
  try {
    let setting = await Setting.findOne();
    if (setting) {
      setting = await Setting.findByIdAndUpdate(setting._id, req.body, {
        new: true,
        runValidators: true
      });
    } else {
      setting = new Setting(req.body);
      await setting.save();
    }
    return res.json(setting);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

/*=====================================================
   404 & ERROR HANDLERS
=====================================================*/
app.use((req, res) => res.status(404).json({ message: 'Route not found' }));

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  return res.status(500).json({
    message: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error'
  });
});

/*=====================================================
   LOCAL SERVER (dev only)
=====================================================*/
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;