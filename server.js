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

/* =====================================================
   CORS
===================================================== */

const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  process.env.CLIENT_URL
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow Postman, Thunder Client and server-to-server requests
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true
  })
);

/* =====================================================
   BODY PARSER
===================================================== */

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/* =====================================================
   LOCAL FILE UPLOADS
   NEVER CREATE /uploads ON VERCEL
===================================================== */

let upload = null;

if (process.env.NODE_ENV !== 'production') {
  const uploadsPath = path.join(__dirname, 'uploads');

  // This code runs ONLY locally
  if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath, {
      recursive: true
    });
  }

  app.use(
    '/uploads',
    express.static(uploadsPath)
  );

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadsPath);
    },

    filename: (req, file, cb) => {
      const extension = path.extname(
        file.originalname
      );

      cb(
        null,
        `${Date.now()}-${Math.round(
          Math.random() * 1e9
        )}${extension}`
      );
    }
  });

  upload = multer({
    storage,
    limits: {
      fileSize: 5 * 1024 * 1024
    }
  });
}

/* =====================================================
   MONGODB
===================================================== */

let dbPromise = null;

const connectDB = async () => {
  if (mongoose.connection.readyState === 1) {
    return;
  }

  if (!process.env.MONGO_URI) {
    throw new Error(
      'MONGO_URI is not defined'
    );
  }

  await mongoose.connect(
    process.env.MONGO_URI
  );

  console.log('MongoDB connected');

  /* =================================================
     DEFAULT ADMIN
  ================================================= */

  const adminCount =
    await Admin.countDocuments();

  if (adminCount === 0) {
    const password =
      process.env.ADMIN_PASSWORD ||
      'admin123';

    const hashedPassword =
      await bcrypt.hash(password, 10);

    await Admin.create({
      email:
        process.env.ADMIN_EMAIL ||
        'admin@example.com',

      password: hashedPassword
    });

    console.log(
      'Default admin created'
    );
  }

  /* =================================================
     INITIAL SETTINGS
  ================================================= */

  const settingCount =
    await Setting.countDocuments();

  if (settingCount === 0) {
    await Setting.create({
      name: 'Zaheer Ahmed',

      title:
        'Website Developer / MERN Stack Developer',

      bio:
        'Professional MERN Stack Developer crafting modern and responsive digital experiences.',

      email: 'zaheer@example.com',

      location: 'Pakistan',

      github:
        'https://github.com',

      linkedin:
        'https://linkedin.com'
    });

    console.log(
      'Initial settings created'
    );
  }
};

/* =====================================================
   DATABASE CONNECTION CACHE
===================================================== */

const ensureDB = async () => {
  if (!dbPromise) {
    dbPromise = connectDB().catch(
      (error) => {
        dbPromise = null;
        throw error;
      }
    );
  }

  return dbPromise;
};

/* =====================================================
   DATABASE MIDDLEWARE
===================================================== */

app.use(
  async (req, res, next) => {
    try {
      await ensureDB();
      next();
    } catch (error) {
      console.error(
        'Database connection error:',
        error
      );

      res.status(500).json({
        message:
          'Database connection failed',
        error:
          process.env.NODE_ENV !==
          'production'
            ? error.message
            : undefined
      });
    }
  }
);

/* =====================================================
   HEALTH CHECK
===================================================== */

app.get('/', (req, res) => {
  res.json({
    message:
      'Portfolio Backend is running',
    status: 'success'
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Backend is healthy'
  });
});

/* =====================================================
   AUTH LOGIN
===================================================== */

app.post(
  '/api/auth/login',
  async (req, res) => {
    try {
      const {
        email,
        password
      } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          message:
            'Email and password are required'
        });
      }

      const admin =
        await Admin.findOne({ email });

      if (!admin) {
        return res.status(400).json({
          message:
            'Invalid credentials'
        });
      }

      const isMatch =
        await bcrypt.compare(
          password,
          admin.password
        );

      if (!isMatch) {
        return res.status(400).json({
          message:
            'Invalid credentials'
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
            process.env.JWT_EXPIRE ||
            '1d'
        }
      );

      return res.json({
        token,

        admin: {
          id: admin._id,
          email: admin.email
        }
      });
    } catch (error) {
      console.error(
        'Login error:',
        error
      );

      return res.status(500).json({
        message:
          'Login failed'
      });
    }
  }
);

/* =====================================================
   FILE UPLOAD
===================================================== */

if (upload) {
  // LOCAL DEVELOPMENT ONLY

  app.post(
    '/api/upload',
    authMiddleware,
    upload.single('file'),
    (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({
            message:
              'No file uploaded'
          });
        }

        return res.json({
          url: `/uploads/${req.file.filename}`
        });
      } catch (error) {
        return res.status(500).json({
          message:
            'File upload failed'
        });
      }
    }
  );
} else {
  // VERCEL PRODUCTION

  app.post(
    '/api/upload',
    authMiddleware,
    (req, res) => {
      return res.status(501).json({
        message:
          'File uploads are disabled in production. Use Cloudinary or another cloud storage service.'
      });
    }
  );
}

/* =====================================================
   GENERIC CRUD ROUTES
===================================================== */

const createCrudRoutes = (
  Model,
  routePath
) => {
  /* ================= GET ================= */

  app.get(
    `/api/${routePath}`,
    async (req, res) => {
      try {
        const items =
          await Model.find().sort({
            createdAt: -1
          });

        return res.json(items);
      } catch (error) {
        console.error(
          `GET /api/${routePath}:`,
          error
        );

        return res.status(500).json({
          message:
            error.message
        });
      }
    }
  );

  /* ================= POST ================= */

  app.post(
    `/api/${routePath}`,
    authMiddleware,
    async (req, res) => {
      try {
        const newItem =
          new Model(req.body);

        const savedItem =
          await newItem.save();

        return res
          .status(201)
          .json(savedItem);
      } catch (error) {
        console.error(
          `POST /api/${routePath}:`,
          error
        );

        return res.status(400).json({
          message:
            error.message
        });
      }
    }
  );

  /* ================= PUT ================= */

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
              new: true,
              runValidators: true
            }
          );

        if (!updatedItem) {
          return res.status(404).json({
            message:
              'Item not found'
          });
        }

        return res.json(
          updatedItem
        );
      } catch (error) {
        console.error(
          `PUT /api/${routePath}:`,
          error
        );

        return res.status(400).json({
          message:
            error.message
        });
      }
    }
  );

  /* ================= DELETE ================= */

  app.delete(
    `/api/${routePath}/:id`,
    authMiddleware,
    async (req, res) => {
      try {
        const deletedItem =
          await Model.findByIdAndDelete(
            req.params.id
          );

        if (!deletedItem) {
          return res.status(404).json({
            message:
              'Item not found'
          });
        }

        return res.json({
          message:
            'Deleted successfully'
        });
      } catch (error) {
        console.error(
          `DELETE /api/${routePath}:`,
          error
        );

        return res.status(500).json({
          message:
            error.message
        });
      }
    }
  );
};

/* =====================================================
   CRUD COLLECTIONS
===================================================== */

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

/* =====================================================
   MESSAGES
===================================================== */

/* ================= PUBLIC ================= */

app.post(
  '/api/messages',
  async (req, res) => {
    try {
      const newMessage =
        new Message(req.body);

      await newMessage.save();

      return res.status(201).json({
        message:
          'Message sent successfully'
      });
    } catch (error) {
      console.error(
        'Message error:',
        error
      );

      return res.status(400).json({
        message:
          error.message
      });
    }
  }
);

/* ================= ADMIN GET ================= */

app.get(
  '/api/messages',
  authMiddleware,
  async (req, res) => {
    try {
      const messages =
        await Message.find().sort({
          createdAt: -1
        });

      return res.json(messages);
    } catch (error) {
      return res.status(500).json({
        message:
          error.message
      });
    }
  }
);

/* ================= ADMIN DELETE ================= */

app.delete(
  '/api/messages/:id',
  authMiddleware,
  async (req, res) => {
    try {
      const deletedMessage =
        await Message.findByIdAndDelete(
          req.params.id
        );

      if (!deletedMessage) {
        return res.status(404).json({
          message:
            'Message not found'
        });
      }

      return res.json({
        message:
          'Message deleted successfully'
      });
    } catch (error) {
      return res.status(500).json({
        message:
          error.message
      });
    }
  }
);

/* =====================================================
   SETTINGS
===================================================== */

/* ================= PUBLIC GET ================= */

app.get(
  '/api/settings',
  async (req, res) => {
    try {
      const setting =
        await Setting.findOne();

      return res.json(
        setting || {}
      );
    } catch (error) {
      return res.status(500).json({
        message:
          error.message
      });
    }
  }
);

/* ================= ADMIN UPDATE ================= */

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
              new: true,
              runValidators: true
            }
          );
      } else {
        setting =
          new Setting(req.body);

        await setting.save();
      }

      return res.json(setting);
    } catch (error) {
      return res.status(400).json({
        message:
          error.message
      });
    }
  }
);

/* =====================================================
   404
===================================================== */

app.use(
  (req, res) => {
    return res.status(404).json({
      message:
        'Route not found'
    });
  }
);

/* =====================================================
   ERROR HANDLER
===================================================== */

app.use(
  (err, req, res, next) => {
    console.error(
      'Server error:',
      err
    );

    return res.status(500).json({
      message:
        process.env.NODE_ENV !==
        'production'
          ? err.message
          : 'Internal server error'
    });
  }
);

/* =====================================================
   LOCAL SERVER
===================================================== */

if (
  process.env.NODE_ENV !==
  'production'
) {
  const PORT =
    process.env.PORT || 5000;

  app.listen(
    PORT,
    () => {
      console.log(
        `Server running on port ${PORT}`
      );
    }
  );
}

/* =====================================================
   VERCEL
===================================================== */

module.exports = app;