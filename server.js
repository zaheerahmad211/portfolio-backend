const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

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

/* =========================
   CORS
========================= */

const allowedOrigins = [
  'http://localhost:5173',
  process.env.CLIENT_URL
].filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests without an Origin header
      // such as Postman, Thunder Client, server-to-server requests
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true
  })
);

/* =========================
   Middleware
========================= */

app.use(express.json({ limit: '10mb' }));

/* =========================
   Local Uploads
   Only enabled during local development
========================= */

let upload = null;

if (process.env.NODE_ENV !== 'production') {
  const uploadsPath = path.join(__dirname, 'uploads');

  if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath, { recursive: true });
  }

  app.use('/uploads', express.static(uploadsPath));

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadsPath);
    },

    filename: (req, file, cb) => {
      cb(
        null,
        Date.now() + path.extname(file.originalname)
      );
    }
  });

  upload = multer({ storage });
}

/* =========================
   MongoDB
========================= */

let dbPromise = null;

const connectDB = async () => {
  // Already connected
  if (mongoose.connection.readyState === 1) {
    return;
  }

  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is not defined');
  }

  await mongoose.connect(process.env.MONGO_URI);

  console.log('MongoDB connected');

  /* =========================
     Create Default Admin
  ========================= */

  const adminCount = await Admin.countDocuments();

  if (adminCount === 0) {
    const hashedPassword = await bcrypt.hash(
      process.env.ADMIN_PASSWORD || 'admin123',
      10
    );

    await Admin.create({
      email:
        process.env.ADMIN_EMAIL ||
        'admin@example.com',

      password: hashedPassword
    });

    console.log('Default admin created');
  }

  /* =========================
     Initial Settings
  ========================= */

  const settingCount = await Setting.countDocuments();

  if (settingCount === 0) {
    await Setting.create({
      name: 'Zaheer Ahmed',

      title:
        'Website Developer / MERN Stack Developer',

      bio:
        'Professional MERN stack developer crafting modern digital experiences.',

      email: 'zaheer@example.com',

      location: 'Pakistan',

      github: 'https://github.com',

      linkedin: 'https://linkedin.com'
    });

    console.log('Initial settings created');
  }
};

const ensureDB = async () => {
  if (!dbPromise) {
    dbPromise = connectDB().catch((error) => {
      dbPromise = null;
      throw error;
    });
  }

  return dbPromise;
};

/* =========================
   Database Middleware
========================= */

app.use(async (req, res, next) => {
  try {
    await ensureDB();
    next();
  } catch (error) {
    console.error(
      'Database connection error:',
      error
    );

    res.status(500).json({
      message: 'Database connection failed'
    });
  }
});

/* =========================
   Health Check
========================= */

app.get('/', (req, res) => {
  res.json({
    message: 'Portfolio Backend is running',
    status: 'success'
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Backend is healthy'
  });
});

/* =========================
   Auth Routes
========================= */

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const admin = await Admin.findOne({ email });

    if (!admin) {
      return res.status(400).json({
        message: 'Invalid credentials'
      });
    }

    const isMatch = await bcrypt.compare(
      password,
      admin.password
    );

    if (!isMatch) {
      return res.status(400).json({
        message: 'Invalid credentials'
      });
    }

    const token = jwt.sign(
      {
        id: admin._id
      },

      process.env.JWT_SECRET ||
        'fallback_secret',

      {
        expiresIn:
          process.env.JWT_EXPIRE || '1d'
      }
    );

    res.json({
      token,

      admin: {
        email: admin.email
      }
    });
  } catch (error) {
    console.error('Login error:', error);

    res.status(500).json({
      message: error.message
    });
  }
});

/* =========================
   File Upload
========================= */

if (upload) {
  // Local development upload
  app.post(
    '/api/upload',
    authMiddleware,
    upload.single('file'),
    (req, res) => {
      if (!req.file) {
        return res.status(400).json({
          message: 'No file uploaded'
        });
      }

      res.json({
        url: `/uploads/${req.file.filename}`
      });
    }
  );
} else {
  // Vercel production
  app.post(
    '/api/upload',
    authMiddleware,
    (req, res) => {
      res.status(501).json({
        message:
          'File uploads are disabled in production. Use Cloudinary or another cloud storage service.'
      });
    }
  );
}

/* =========================
   Generic CRUD Routes
========================= */

const createCrudRoutes = (
  Model,
  routePath
) => {
  /* GET */
  app.get(
    `/api/${routePath}`,
    async (req, res) => {
      try {
        const items = await Model.find().sort({
          createdAt: -1
        });

        res.json(items);
      } catch (error) {
        res.status(500).json({
          message: error.message
        });
      }
    }
  );

  /* POST */
  app.post(
    `/api/${routePath}`,
    authMiddleware,
    async (req, res) => {
      try {
        const newItem = new Model(req.body);

        const savedItem =
          await newItem.save();

        res.status(201).json(savedItem);
      } catch (error) {
        res.status(400).json({
          message: error.message
        });
      }
    }
  );

  /* PUT */
  app.put(
    `/api/${routePath}/:id`,
    authMiddleware,
    async (req, res) => {
      try {
        const updatedItem =
          await Model.findByIdAndUpdate(
            req.params.id,
            req.body,
            {
              new: true
            }
          );

        res.json(updatedItem);
      } catch (error) {
        res.status(400).json({
          message: error.message
        });
      }
    }
  );

  /* DELETE */
  app.delete(
    `/api/${routePath}/:id`,
    authMiddleware,
    async (req, res) => {
      try {
        await Model.findByIdAndDelete(
          req.params.id
        );

        res.json({
          message: 'Deleted successfully'
        });
      } catch (error) {
        res.status(500).json({
          message: error.message
        });
      }
    }
  );
};

/* =========================
   CRUD Collections
========================= */

createCrudRoutes(
  Project,
  'projects'
);

createCrudRoutes(
  Certification,
  'certifications'
);

createCrudRoutes(
  Achievement,
  'achievements'
);

createCrudRoutes(
  Experience,
  'experience'
);

createCrudRoutes(
  Skill,
  'skills'
);

createCrudRoutes(
  Service,
  'services'
);

createCrudRoutes(
  Education,
  'education'
);

/* =========================
   Messages
========================= */

/* Public */
app.post(
  '/api/messages',
  async (req, res) => {
    try {
      const newMessage =
        new Message(req.body);

      await newMessage.save();

      res.status(201).json({
        message:
          'Message sent successfully'
      });
    } catch (error) {
      res.status(400).json({
        message: error.message
      });
    }
  }
);

/* Admin */
app.get(
  '/api/messages',
  authMiddleware,
  async (req, res) => {
    try {
      const messages =
        await Message.find().sort({
          createdAt: -1
        });

      res.json(messages);
    } catch (error) {
      res.status(500).json({
        message: error.message
      });
    }
  }
);

/* Admin */
app.delete(
  '/api/messages/:id',
  authMiddleware,
  async (req, res) => {
    try {
      await Message.findByIdAndDelete(
        req.params.id
      );

      res.json({
        message: 'Deleted'
      });
    } catch (error) {
      res.status(500).json({
        message: error.message
      });
    }
  }
);

/* =========================
   Settings
========================= */

/* Public */
app.get(
  '/api/settings',
  async (req, res) => {
    try {
      const setting =
        await Setting.findOne();

      res.json(setting || {});
    } catch (error) {
      res.status(500).json({
        message: error.message
      });
    }
  }
);

/* Admin */
app.put(
  '/api/settings',
  authMiddleware,
  async (req, res) => {
    try {
      let setting =
        await Setting.findOne();

      if (setting) {
        setting =
          await Setting.findByIdAndUpdate(
            setting._id,
            req.body,
            {
              new: true
            }
          );
      } else {
        setting = new Setting(req.body);

        await setting.save();
      }

      res.json(setting);
    } catch (error) {
      res.status(400).json({
        message: error.message
      });
    }
  }
);

/* =========================
   404 Handler
========================= */

app.use((req, res) => {
  res.status(404).json({
    message: 'Route not found'
  });
});

/* =========================
   Error Handler
========================= */

app.use(
  (err, req, res, next) => {
    console.error(err);

    res.status(500).json({
      message:
        err.message ||
        'Internal server error'
    });
  }
);

/* =========================
   Local Server
========================= */

if (process.env.NODE_ENV !== 'production') {
  const PORT =
    process.env.PORT || 5000;

  app.listen(PORT, () => {
    console.log(
      `Server running on port ${PORT}`
    );
  });
}

/* =========================
   Vercel
========================= */

module.exports = app;