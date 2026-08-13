import mongoose from "mongoose";

const url = process.env.MONGODB_URI || "mongodb://admin:password123@localhost:27017/myDatabase?authSource=admin";


export const connectDB = async () => {
  try {
    await mongoose.connect(url);
    console.log("✅ MongoDB Connected");

  } catch (err) {
    console.error("❌ DB Error:", err);
    process.exit(1);
  }
};