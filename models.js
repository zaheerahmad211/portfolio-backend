const mongoose = require('mongoose');

// Use a large string field for image URLs (supports base64 data URLs)
const imageField = { type: String, default: '' };

const adminSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});

const projectSchema = new mongoose.Schema({
  title: String,
  description: String,
  image: imageField,
  technologies: [String],
  category: String,
  githubUrl: String,
  liveUrl: String,
  featured: Boolean,
  status: String,
  createdAt: { type: Date, default: Date.now }
});

const certificationSchema = new mongoose.Schema({
  title: String,
  organization: String,
  image: imageField,
  certificateUrl: imageField,
  issueDate: Date,
  credentialId: String,
  credentialUrl: String,
  description: String,
  createdAt: { type: Date, default: Date.now }
});

const achievementSchema = new mongoose.Schema({
  title: String,
  description: String,
  date: Date,
  image: imageField,
  externalUrl: String,
  createdAt: { type: Date, default: Date.now }
});

const experienceSchema = new mongoose.Schema({
  position: String,
  company: String,
  location: String,
  startDate: Date,
  endDate: Date,
  current: Boolean,
  description: String,
  technologies: [String],
  createdAt: { type: Date, default: Date.now }
});

const skillSchema = new mongoose.Schema({
  name: String,
  category: String,
  icon: imageField,   // stores base64 data URL of the skill logo
  proficiency: Number,
  createdAt: { type: Date, default: Date.now }
});

const serviceSchema = new mongoose.Schema({
  title: String,
  description: String,
  icon: imageField,
  createdAt: { type: Date, default: Date.now }
});

const messageSchema = new mongoose.Schema({
  name: String,
  email: String,
  subject: String,
  message: String,
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const settingSchema = new mongoose.Schema({
  name: String,
  title: String,
  bio: String,
  profileImage: imageField,   // base64 data URL of profile photo
  email: String,
  phone: String,
  location: String,
  resumeUrl: String,
  aboutText: String,
  heroText: String,
  github: String,
  linkedin: String,
  fiverr: String,
  vercel: String
});

const educationSchema = new mongoose.Schema({
  degree: String,
  institution: String,
  startDate: Date,
  endDate: Date,
  current: Boolean,
  description: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = {
  Admin: mongoose.model('Admin', adminSchema),
  Project: mongoose.model('Project', projectSchema),
  Certification: mongoose.model('Certification', certificationSchema),
  Achievement: mongoose.model('Achievement', achievementSchema),
  Experience: mongoose.model('Experience', experienceSchema),
  Skill: mongoose.model('Skill', skillSchema),
  Service: mongoose.model('Service', serviceSchema),
  Message: mongoose.model('Message', messageSchema),
  Setting: mongoose.model('Setting', settingSchema),
  Education: mongoose.model('Education', educationSchema)
};
