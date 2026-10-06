const mongoose = require('mongoose');
const { Project, Certification, Skill } = require('./models');

mongoose.connect('mongodb://127.0.0.1:27017/portfolio').then(async () => {
  console.log('Connected to MongoDB for seeding');

  // Seed Projects
  const projectCount = await Project.countDocuments();
  if (projectCount === 0) {
    await Project.insertMany([
      { title: 'E-Commerce Buy & Sell Website', description: 'A fully functional MERN stack e-commerce platform with Stripe integration.', category: 'Web Development', githubUrl: 'https://github.com', liveUrl: 'https://example.com' },
      { title: 'MERN ERP System', description: 'An enterprise resource planning system for managing business operations efficiently.', category: 'Enterprise Apps', githubUrl: 'https://github.com', liveUrl: 'https://example.com' },
      { title: 'Super Admin Dashboard', description: 'A robust admin dashboard for managing users, analytics, and content.', category: 'Admin Panels', githubUrl: 'https://github.com', liveUrl: 'https://example.com' }
    ]);
    console.log('Projects seeded');
  }

  // Seed Certifications
  const certCount = await Certification.countDocuments();
  if (certCount === 0) {
    await Certification.insertMany([
      { title: 'MERN Stack Development', organization: 'Udemy / Coursera', issueDate: new Date('2023-01-01') }
    ]);
    console.log('Certifications seeded');
  }

  // Seed Skills
  const skillCount = await Skill.countDocuments();
  if (skillCount === 0) {
    const skills = ['React.js', 'JavaScript', 'Node.js', 'Express.js', 'MongoDB', 'Tailwind CSS', 'Git/GitHub', 'SEO'];
    await Skill.insertMany(skills.map(s => ({ name: s, category: 'Technical' })));
    console.log('Skills seeded');
  }

  console.log('Seeding completed!');
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
