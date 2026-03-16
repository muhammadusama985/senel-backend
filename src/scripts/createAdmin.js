const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const dotenv = require('dotenv');
const path = require('path');
const User = require('../models/User');

// Load environment variables from the correct path
// Going up two levels: from src/scripts to project root
const envPath = path.resolve(__dirname, '../../.env');
console.log('Loading .env from:', envPath);

const result = dotenv.config({ path: envPath });

if (result.error) {
  console.error('Error loading .env file:', result.error);
  console.log('Please make sure .env file exists at:', envPath);
  process.exit(1);
}

// Verify MongoDB URI is loaded
if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is not defined in environment variables');
  console.log('Available env vars:', Object.keys(process.env).filter(key => !key.includes('SECRET')));
  process.exit(1);
}

console.log('MongoDB URI loaded successfully');

async function createAdmin() {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected successfully');

    // Admin details
    const adminData = {
      email: 'admin@senel.com',
      password: 'Admin@123456', // Change this to a strong password
      role: 'admin'
    };

    // Check if admin already exists
    console.log('Checking for existing admin...');
    const existingAdmin = await User.findOne({ email: adminData.email });
    if (existingAdmin) {
      console.log('⚠️ Admin user already exists!');
      console.log('Email:', existingAdmin.email);
      console.log('Role:', existingAdmin.role);
      process.exit(0);
    }

    // Hash password
    console.log('Creating admin user...');
    const passwordHash = await bcrypt.hash(adminData.password, 12);

    // Create admin user
    const admin = await User.create({
      email: adminData.email,
      passwordHash,
      role: 'admin',
      status: 'active'
    });

    console.log('\n✅ Admin user created successfully!');
    console.log('📧 Email:', admin.email);
    console.log('🔑 Password:', adminData.password);
    console.log('👤 Role:', admin.role);
    console.log('\n⚠️  IMPORTANT: Save these credentials and delete this script in production!');
    console.log('⚠️  Change the password after first login!');

  } catch (error) {
    console.error('❌ Error creating admin:', error);
    
    // More specific error messages
    if (error.name === 'MongoNetworkError') {
      console.error('Could not connect to MongoDB. Make sure MongoDB is running.');
    } else if (error.code === 11000) {
      console.error('Duplicate key error. User might already exist with this email.');
    }
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit();
  }
}

createAdmin();